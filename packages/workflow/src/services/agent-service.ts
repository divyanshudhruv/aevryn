import {
	anakinToolSet,
	askUserTool,
	beginTaskTool,
	createAevrynAgent,
	ModelRegistry,
	makeRetryAgentTool,
	presentPlanTool,
	STREAM_RETRIES,
	streamTransform,
	type ToolContext,
	updateStepStatusTool,
} from "@aevryn/agent";
import {
	db,
	decryptSecret,
	ids,
	threads,
	userKeys,
	userProviders,
	userSettings,
} from "@aevryn/db";
import { convertToModelMessages, generateText, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";

import { buildInstructions, pruneModelHistory } from "./agent-history";
import { TurnLifecycle } from "./agent-turn";
import { ChatService } from "./chat-service";

// Scoped to chat mode, where the model only needs research/scrape + memory.
// Wire/browser automation stays in run mode (bound workflow execution).
const CHAT_TOOL_NAMES = new Set([
	"searchWeb",
	"scrapeUrl",
	"scrapeBatch",
	"crawlSite",
	"mapSite",
	"researchTopic",
	"aiVisibility",
	"aiVisibilitySources",
	"aiVisibilitySearches",
	"aiVisibilityRetry",
	"storeMemory",
	"searchMemory",
]);

export interface AgentRunInput {
	userId: string;
	workspaceId: string;
	threadId: string;
	uiMessages: UIMessage[];
	mode: "chat" | "run";
	modelOverride?: { providerSlug?: string; modelId?: string };
	/** Reasoning effort (providerOptions) — ignored by non-reasoning models. */
	thinkingEffort?: string;
	/** Optional first user message used to auto-title the thread after a
	 *  successful turn (moved from the route so a mid-turn failure can't
	 *  orphan the title-generation call). */
	autoTitleMessage?: string;
}

export interface AgentRunServices {
	chat: ChatService;
}

export class AgentService {
	private readonly chat: ChatService;

	constructor(
		services?: Partial<AgentRunServices>,
		private readonly client = db,
	) {
		this.chat = services?.chat ?? new ChatService(this.client);
	}

	async respond(
		input: AgentRunInput,
		init?: ResponseInit & { signal?: AbortSignal },
	): Promise<Response> {
		// All pre-stream DB work (model resolution, keys, settings, thread
		// status) runs in parallel — the model's first token must not wait on
		// a serial chain of four sequential queries.
		const [
			{ model, providerSlug },
			{ anakinKey, mem0Key },
			settingsRows,
			threadRow,
		] = await Promise.all([
			this.resolveModel(input),
			this.resolveKeys(input.userId),
			this.client
				.select({ settings: userSettings.settings })
				.from(userSettings)
				.where(eq(userSettings.userId, input.userId))
				.limit(1),
			this.client
				.select({
					status: threads.status,
					boundWorkflowId: threads.boundWorkflowId,
				})
				.from(threads)
				.where(eq(threads.id, input.threadId))
				.limit(1),
		]);

		// Memory switch: null means "on when a key exists" (legacy behavior).
		const memoryEnabled =
			(settingsRows[0]?.settings.memoryEnabled ?? null) !== false;
		const threadRowHead = threadRow[0];
		// A thread left in `failed` tells the agent the previous turn died
		// mid-run: retryAgent repairs the missed step instead of restarting.
		const threadFailed = threadRowHead?.status === "failed";
		// Resolve the workflow in chat mode TOO when the thread is bound — the
		// approval-resume races the client's mode flip (realtime lag), so the
		// resumed loop must see the just-bound plan or it re-offers presentPlan.
		// Cost: zero for plan-less chat threads (guard below).
		const boundWorkflow =
			input.mode === "run" || threadRowHead?.boundWorkflowId != null
				? await this.chat.boundWorkflow(input.threadId, input.userId)
				: null;

		// Thread status lifecycle: running while the agent works (retrying for
		// a re-run of a failed thread — repair mode, not a fresh start); the
		// terminal onEnd sets the final state. Fire-and-forget so it never
		// delays the first model token.
		const lifecycle = new TurnLifecycle({
			chat: this.chat,
			userId: input.userId,
			threadId: input.threadId,
			mode: input.mode,
			boundWorkflow,
			signal: init?.signal,
			onTurnCompleted: input.autoTitleMessage
				? () => {
						void this.autoTitle({
							threadId: input.threadId,
							userId: input.userId,
							message: input.autoTitleMessage!,
						}).catch(() => undefined);
					}
				: undefined,
		});
		void lifecycle.setStatus(threadFailed ? "retrying" : "running");

		// Tool set is mode-scoped. Plain chat carries only the research/scrape/
		// memory core — every tool body ships its full parameter schema in the
		// prompt, and wire/browser automation schemas alone eat thousands of
		// input tokens per turn ("Hi" was burning ~5k worth mostly on tool JSON).
		// Run mode gets the complete set, since executing a bound workflow
		// legitimately needs site automation.
		const toolNames =
			input.mode === "run"
				? Object.keys(anakinToolSet)
				: Object.keys(anakinToolSet).filter((name) =>
						CHAT_TOOL_NAMES.has(name),
					);

		const tools = {
			...Object.fromEntries(
				toolNames.map((name) => [
					name,
					anakinToolSet[name as keyof typeof anakinToolSet],
				]),
			),
			askUser: askUserTool,
			presentPlan: presentPlanTool,
			beginTask: beginTaskTool,
			retryAgent: makeRetryAgentTool({ model }),
			// Chat mode too: a bound plan may be executed on explicit user ask
			// in chat (F8) — without this, chat-mode execution could never move
			// the plan-steps slider.
			...(boundWorkflow ? { updateStepStatus: updateStepStatusTool } : {}),
		} as const;

		// toolsContext is a per-tool map (AI SDK v5): each tool name maps to its own
		// context object, validated against the tool's contextSchema before execution.
		const context: ToolContext = {
			userId: input.userId,
			threadId: input.threadId,
			workspaceId: input.workspaceId,
			anakinKey,
			mem0Key: memoryEnabled ? mem0Key : null,
			...(boundWorkflow ? { workflowId: boundWorkflow.id } : {}),
		};
		const toolsContext = Object.fromEntries(
			Object.keys(tools).map((k) => [k, context]),
		);

		const agent = createAevrynAgent({
			model,
			mode: input.mode,
			tools: tools as never,
			instructions: buildInstructions(input, boundWorkflow, threadFailed),
			toolsContext,
			thinkingEffort: input.thinkingEffort,
			providerOptionsKey: providerSlug,
		});

		// The SDK's declared `stream()` type omits `toolsContext`/`streamRetries`
		// (they exist at runtime); extend it rather than losing callback types.
		const streamFn = agent.stream.bind(agent) as (
			options: Parameters<typeof agent.stream>[0] & {
				toolsContext?: unknown;
				streamRetries?: number;
				onError?: (event: { error: unknown }) => void | Promise<void>;
			},
		) => ReturnType<typeof agent.stream>;
		const result = await streamFn({
			messages: await convertToModelMessages(
				pruneModelHistory(input.uiMessages),
			),
			experimental_transform: [...streamTransform],
			// Per-call context. streamRetries is 0: the SDK's mid-stream retry
			// buffers tool parts but streams TEXT live, so a retry re-sends the
			// narration as a second text part and the turn renders TWICE in real
			// time. Transient provider blips instead fail the turn loudly —
			// error tile + failed status + retryAgent repair path (see agent.ts).
			toolsContext: toolsContext,
			streamRetries: STREAM_RETRIES,
			// Client disconnect / composer Stop / sidebar Stop abort the HTTP
			// request; forwarding the signal cancels the model call and in-flight
			// tools instead of letting the loop run to completion invisibly.
			abortSignal: init?.signal,
			// The SDK's stream retry is otherwise invisible: onError fires per
			// provider-error chunk, so the lifecycle knows a replay happened and
			// can collapse the duplicated text at persistence time.
			onError: () => {
				lifecycle.onProviderRetry();
			},
			onToolExecutionStart: (event) => {
				lifecycle.onToolExecutionStart(event);
			},
			onToolExecutionEnd: (event) => {
				lifecycle.onToolExecutionEnd(event);
			},
			onStepEnd: (event) => {
				lifecycle.onStepEnd(event);
			},
			onEnd: (event) => {
				return lifecycle.onAgentEnd(
					event as {
						finishReason?: string;
						totalUsage?: {
							inputTokens?: number;
							outputTokens?: number;
							totalTokens?: number;
						};
					},
				);
			},
		});

		return result.toUIMessageStreamResponse({
			...init,
			// Token usage rides to the client on the message metadata. Read from
			// the finish part directly (part.totalUsage) — the agent-level onEnd
			// that fills finalUsage fires after this stream part, so reading the
			// variable here would race and often emit zeros.
			messageMetadata: ({ part }) => {
				if (part.type !== "finish") return undefined;
				const usage = part.totalUsage;
				const inputTokens = usage?.inputTokens ?? lifecycle.usage.inputTokens;
				const outputTokens =
					usage?.outputTokens ?? lifecycle.usage.outputTokens;
				return {
					usage: {
						inputTokens,
						outputTokens,
						totalTokens: inputTokens + outputTokens,
					},
					createdAt: new Date().toISOString(),
				};
			},
			originalMessages: input.uiMessages,
			generateMessageId: () => ids.message(),
			// Reasoning parts stream LIVE to the client (the timeline renders them
			// as step descriptions inside the thinking card). They are stripped
			// from persistence: replaying them would serialize to
			// `reasoning_content`, which Groq (and other OpenAI-compatible
			// providers) reject with a 400.
			sendReasoning: true,
			// The UIMessage-stream end event carries the FULL message list —
			// including every tool part, client-tool answer (askUser answers,
			// plan decisions), and approval response. Persisting here is what
			// makes the whole timeline (not just text) survive refresh.
			onEnd: ({ responseMessage }) => {
				return lifecycle.finishTurn(responseMessage);
			},
		});
	}

	// ─── Auto title ───────────────────────────────────────────────────────

	/** Titles that mean "the user never named this thread" — safe to
	 *  auto-replace with a generated summary title. */
	private static readonly DEFAULT_TITLES = new Set([
		"",
		"new thread",
		"untitled",
	]);

	/** After the first real user message, generate a short ChatGPT-style
	 *  title (3–6 words) from it and update the thread row. Fire-and-forget:
	 *  the postgres_changes realtime channel pushes the new title to the
	 *  header thread-switcher and the sidebar automatically. Never overwrites
	 *  a user-set title or an already-generated one. */
	async autoTitle(input: {
		threadId: string;
		userId: string;
		message: string;
	}): Promise<void> {
		try {
			const [threadRow] = await this.client
				.select({ title: threads.title })
				.from(threads)
				.where(
					and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
				)
				.limit(1);
			if (!threadRow) return;
			if (
				!AgentService.DEFAULT_TITLES.has(threadRow.title.trim().toLowerCase())
			)
				return;

			const { model } = await this.resolveModel({
				userId: input.userId,
			} as AgentRunInput);
			const { text } = await generateText({
				model,
				maxOutputTokens: 40,
				prompt:
					"Generate a concise title (3-6 words, no quotes, no trailing period) " +
					"summarizing what the user wants in this conversation. Reply with " +
					`ONLY the title text and nothing else.\n\nUser message: ${input.message.slice(0, 500)}`,
			});
			const title = text
				.trim()
				.replace(/^["'“”]+|["'“”.]+$/g, "")
				.slice(0, 80);
			if (!title) return;

			await this.client
				.update(threads)
				.set({ title })
				.where(
					and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
				);
		} catch {
			// Title generation is cosmetic — provider errors, missing models, or
			// race conditions must never break the chat turn.
		}
	}

	// ─── Resolution helpers ────────────────────────────────────────────────────

	private async resolveModel(input: AgentRunInput): Promise<{
		model: ReturnType<typeof ModelRegistry.resolve>;
		providerSlug: string;
	}> {
		const [providers, settingsRows] = await Promise.all([
			this.client
				.select()
				.from(userProviders)
				.where(eq(userProviders.userId, input.userId)),
			this.client
				.select({ settings: userSettings.settings })
				.from(userSettings)
				.where(eq(userSettings.userId, input.userId))
				.limit(1),
		]);

		if (providers.length === 0) {
			throw Object.assign(
				new Error(
					"No model provider configured. Add one in Settings → Models.",
				),
				{ code: "NO_PROVIDER" },
			);
		}

		const savedDefault = settingsRows[0]?.settings.defaultModel ?? null;

		// Precedence: per-request override → saved default → first provider.
		const override = input.modelOverride?.providerSlug
			? input.modelOverride
			: savedDefault;

		const provider =
			(override?.providerSlug
				? providers.find(
						(p: { slug: string }) => p.slug === override.providerSlug,
					)
				: undefined) ?? providers[0]!;

		const modelId = override?.modelId ?? provider.models[0]?.id ?? "";
		if (!modelId) {
			throw Object.assign(
				new Error(`Provider '${provider.slug}' has no models configured.`),
				{ code: "NO_MODEL" },
			);
		}

		return {
			model: ModelRegistry.resolve(provider, modelId),
			providerSlug: provider.slug,
		};
	}

	private async resolveKeys(userId: string): Promise<{
		anakinKey: string | null;
		mem0Key: string | null;
	}> {
		const keys = await this.client
			.select()
			.from(userKeys)
			.where(eq(userKeys.userId, userId));

		const find = (name: string): string | null => {
			const row = keys.find((k: { name: string }) => k.name === name);
			if (!row) return null;
			try {
				return decryptSecret(row.encryptedValue);
			} catch {
				return null;
			}
		};

		return { anakinKey: find("anakin"), mem0Key: find("mem0") };
	}
}
