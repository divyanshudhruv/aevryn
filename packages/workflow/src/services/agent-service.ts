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
	thinkingEffort?: string;
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

		const memoryEnabled =
			(settingsRows[0]?.settings.memoryEnabled ?? null) !== false;
		const threadRowHead = threadRow[0];
		const threadFailed = threadRowHead?.status === "failed";
		const boundWorkflow =
			input.mode === "run" || threadRowHead?.boundWorkflowId != null
				? await this.chat.boundWorkflow(input.threadId, input.userId)
				: null;

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
			...(boundWorkflow ? { updateStepStatus: updateStepStatusTool } : {}),
		} as const;

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
			toolsContext: toolsContext,
			streamRetries: STREAM_RETRIES,
			abortSignal: init?.signal,
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
			sendReasoning: true,
			onEnd: ({ responseMessage }) => {
				return lifecycle.finishTurn(responseMessage);
			},
		});
	}

	private static readonly DEFAULT_TITLES = new Set([
		"",
		"new thread",
		"untitled",
	]);

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
		} catch {}
	}

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
