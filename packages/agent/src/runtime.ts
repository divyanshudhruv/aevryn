import { env } from "@aevryn/env/server";
import { createGroq } from "@ai-sdk/groq";
import { generateText, isStepCount, tool } from "ai";

import type { CapabilityRegistry, CapabilityResult } from "./capability";

export interface AgentRuntimeOptions {
	registry: CapabilityRegistry;
	objective: string;
	maxSteps?: number;
	model?: string;
	/**
	 * Maximum characters of a tool result that are echoed back to the model.
	 * Full tool output is still recorded in execution records. Apply a cap to
	 * keep the model context small across long agent loops.
	 */
	modelContextCapChars?: number;
	/**
	 * Called as the agent progresses, so the runtime can surface live activity
	 * (tool calls, per-step text) to observers without waiting for completion.
	 */
	onActivity?: (activity: AgentActivity) => Promise<void> | void;
	/**
	 * Extra system-prompt guidance appended to the default tool-selection
	 * instructions. Useful for per-objective constraints.
	 */
	instructions?: string;
	/**
	 * Persisted outputs of tools that already COMPLETED in a previous pass of
	 * the same execution. On a bounded recovery retry these are returned from
	 * storage instead of re-invoking the provider, so a write side effect can
	 * never execute twice. Each entry is consumed once per run.
	 */
	replayedToolOutputs?: Record<string, unknown>;
	/**
	 * Tool names a user has explicitly approved for a resume execution. These
	 * tools are removed from the approval gate so the model may execute them.
	 */
	approvedToolNames?: string[];
}

export type AgentActivity =
	| { type: "tool-start"; tool: string; input: unknown }
	| {
			type: "tool-end";
			tool: string;
			status: "completed" | "failed";
			output?: Record<string, unknown>;
			error?: { code: string; message: string };
		}
	| { type: "step-end"; step: number; text: string };

export interface PendingApproval {
	toolName: string;
	input: unknown;
	approvalId: string;
}

export interface ToolCallProviderLog {
	id: string;
	operation?: string;
	requestId?: string;
	durationMs?: number;
}

export interface ToolCallLog {
	callId: string;
	toolName: string;
	input: Record<string, unknown>;
	output?: Record<string, unknown>;
	status: "completed" | "failed";
	error?: { code: string; message: string };
	provider?: ToolCallProviderLog;
	startedAt: Date;
	completedAt: Date;
}

type CallExecutionRecord = Partial<Omit<ToolCallLog, "input" | "output">> & {
	input?: unknown;
	output?: unknown;
};

export interface AgentStepLog {
	order: number;
	kind: string;
	text?: string;
	toolCalls: ToolCallLog[];
	createdAt: Date;
}

export interface AgentResult {
	text: string;
	toolsCalled: string[];
	pendingApprovals: PendingApproval[];
	steps: AgentStepLog[];
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
		costUsd: number;
	};
}

/**
 * Fallback pricing when the provider reports no cost: a conservative blended
 * rate (input+output) so budget guards never under-count badly. Today the
 * Groq path exposes only token usage, so this estimate is what feeds the cost
 * budget. Keep it deterministic for tests.
 */
export const ESTIMATED_USD_PER_1K_TOKENS = 0.0005;

export function estimateCostUsd(usage: {
	promptTokens: number;
	completionTokens: number;
}): number {
	const total = usage.promptTokens + usage.completionTokens;
	return (total / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
}

const now = () => new Date();

const TOOL_SELECTION_INSTRUCTIONS = `You are Aevryn, a web agent executing a user objective. You decide which capabilities to use; each selection is executed for you and the result is returned to you.

Tool selection policy — always use the cheapest capability that fulfills the objective:
- searchWeb: lookups, fact checks, getting up-to-date info and URLs. Start here for most questions.
- scrapeUrl: reading the actual content of a page when a search snippet is not enough (Markdown, links, images, screenshot, JSON, summary formats). To reuse an authenticated session, pass sessionId/sessionName from browserSessionList.
- crawlSite: exploring a whole site recursively when you need multiple pages.
- mapSite: building an inventory of a site's URLs before deeper investigation.
- researchTopic: only when the objective genuinely requires multi-source research with citations and synthesis. Do not use for a single lookup.
- wireAction: concrete actions against 940+ external services (LinkedIn, Gmail, Amazon, ...).
- browserSessionList/Create/Rename/Delete: persistent authenticated scraping. Check list first; create only when the task needs a logged-in session and none exists. After browserSessionCreate the user must complete a login flow — tell the user to complete it, then continue.

Approval: wireAction and browserSessionCreate/Rename/Delete involve consequential or write actions. Propose them normally with proper inputs; the runtime routes them through approval automatically (or the user delays them). Do not refuse or pre-warn about them — just propose.

General rules:
- Never invent tool inputs. Derive every argument from the objective or from already-observed tool results.
- Stop calling tools as soon as you have enough information; answer directly.
- Never answer by writing code, scripts, cron instructions, or tutorials. You are a web agent that acts through the registered capabilities. If the objective needs a capability you do NOT have (schedules, sending email/Slack/Discord/webhooks, push notifications, storing files), state plainly that it is unavailable and complete the achievable part with tools instead.
- Return your final answer as plain text in your last message.`;

function buildSystemPrompt(extraInstructions: string | undefined): string {
	if (!extraInstructions) return TOOL_SELECTION_INSTRUCTIONS;
	return `${TOOL_SELECTION_INSTRUCTIONS}\n\n${extraInstructions}`;
}

function capModelOutput(data: unknown, capChars: number | undefined): unknown {
	if (!capChars || data == null) return data;
	const json = JSON.stringify(data);
	if (json.length <= capChars) return data;
	return {
		truncated: true,
		maxChars: capChars,
		note: "Full output stored in the execution log. Request more detail with a follow-up tool call only if needed.",
		preview: json.slice(0, capChars),
	} satisfies Record<string, unknown>;
}

export async function runAgent(
	options: AgentRuntimeOptions,
): Promise<AgentResult> {
	const { registry, objective, maxSteps = 5, model = env.GROQ_MODEL } = options;

	const groq = createGroq({ apiKey: env.GROQ_API_KEY });

	const executionRecords = new Map<string, CallExecutionRecord>();
	const replay = { ...(options.replayedToolOutputs ?? {}) };
	const replayTool = (toolName: string): CapabilityResult | null => {
		if (!(toolName in replay)) {
			return null;
		}
		const output = replay[toolName];
		delete replay[toolName];
		return {
			ok: true,
			data: output,
			provider: { id: "replay", operation: "persisted", durationMs: 0 },
		};
	};

	const emit = (activity: AgentActivity) => options.onActivity?.(activity);

	const tools = Object.fromEntries(
		registry.list().map((capability) => [
			capability.name,
			tool({
				description: capability.description,
				inputSchema: capability.inputSchema,
				execute: async (input, executeOptions) => {
					const startedAt = now();
					const callId = executeOptions.toolCallId;
					const record: CallExecutionRecord = {
						callId,
						toolName: capability.name,
						input,
						startedAt,
					};
					executionRecords.set(callId, record);
					await emit({
						type: "tool-start",
						tool: capability.name,
						input,
					});
					const replayResult = replayTool(capability.name);
					if (replayResult) {
						const data = (replayResult as { ok: true; data: unknown }).data;
						const elapsedMs = 0.01;
						record.completedAt = now();
						record.status = "completed";
						record.output = data;
						record.provider = {
							id: "replay",
							operation: "persisted",
							durationMs: elapsedMs,
						};
						await emit({
							type: "tool-end",
							tool: capability.name,
							status: "completed",
							output: data as Record<string, unknown> | undefined,
						});
						return capModelOutput(data, options.modelContextCapChars);
					}
					const startedPerf = performance.now();
					const result = await capability.execute(input);
					const elapsedMs =
						result.provider?.durationMs ?? performance.now() - startedPerf;
					record.completedAt = now();
					if (!result.ok) {
						record.status = "failed";
						record.error = {
							code: result.error.code,
							message: result.error.message,
						};
						record.provider = result.provider ?? {
							id: capability.name,
							durationMs: elapsedMs,
						};
						await emit({
							type: "tool-end",
							tool: capability.name,
							status: "failed",
							error: record.error,
						});
						throw new Error(`${result.error.code}: ${result.error.message}`);
					}
					record.status = "completed";
					record.output = result.data;
					record.provider = result.provider ?? {
						id: capability.name,
						durationMs: elapsedMs,
					};
					await emit({
						type: "tool-end",
						tool: capability.name,
						status: "completed",
						output: result.data as Record<string, unknown> | undefined,
					});
					return capModelOutput(result.data, options.modelContextCapChars);
				},
			}),
		]),
	);

	const approved = new Set(options.approvedToolNames ?? []);
	const toolApproval = Object.fromEntries(
		registry
			.list()
			.filter((c) => c.requiresApproval && !approved.has(c.name))
			.map((c) => [c.name, "user-approval" as const]),
	);

	const {
		text,
		steps: rawSteps,
		usage,
	} = await generateText({
		model: groq.languageModel(model),
		system: buildSystemPrompt(options.instructions),
		tools,
		toolApproval,
		stopWhen: isStepCount(maxSteps),
		prompt: objective,
		onStepEnd: (event) =>
			emit({
				type: "step-end",
				step: event.stepNumber,
				text: event.text,
			}),
	});

	const stepsSucceeded = rawSteps.filter((step) => step.toolResults.length > 0);

	const toolsCalled = stepsSucceeded.flatMap((step) =>
		step.toolResults.map((result) => result.toolName),
	);

	const pendingApprovals: PendingApproval[] = rawSteps.flatMap((step) =>
		step.content
			.filter((part) => part.type === "tool-approval-request")
			.map((part) => {
				const request = part as {
					type: "tool-approval-request";
					approvalId: string;
					toolCall: { toolName: string; input?: unknown };
					reason?: string;
				};
				return {
					toolName: request.toolCall.toolName,
					input: request.toolCall.input,
					approvalId: request.approvalId,
				};
			}),
	);

	const steps: AgentStepLog[] = rawSteps.map((step, order) => ({
		order,
		kind: "agent",
		text: step.text?.trim() || undefined,
		toolCalls: step.toolResults.map((result) => {
			const record = executionRecords.get(result.toolCallId) ?? {};
			return {
				callId: result.toolCallId,
				toolName: result.toolName,
				input: (result.input ?? record.input) as Record<string, unknown>,
				output: record.output as Record<string, unknown> | undefined,
				status: record.status ?? "completed",
				error: record.error,
				provider: record.provider,
				startedAt: record.startedAt ?? now(),
				completedAt: record.completedAt ?? now(),
			};
		}),
		createdAt: now(),
	}));

	return {
		text,
		toolsCalled,
		pendingApprovals,
		steps,
		usage: {
			promptTokens: usage.inputTokens ?? 0,
			completionTokens: usage.outputTokens ?? 0,
			totalTokens: usage.totalTokens ?? 0,
			costUsd: estimateCostUsd({
				promptTokens: usage.inputTokens ?? 0,
				completionTokens: usage.outputTokens ?? 0,
			}),
		},
	};
}
