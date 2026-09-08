import { env } from "@aevryn/env/server";
import { createGroq } from "@ai-sdk/groq";
import { generateText, isStepCount, tool } from "ai";

import type { CapabilityRegistry } from "./capability";

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
}

export type AgentActivity =
	| { type: "tool-start"; tool: string; input: unknown }
	| { type: "tool-end"; tool: string; status: "completed" | "failed" }
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
					});
					return capModelOutput(result.data, options.modelContextCapChars);
				},
			}),
		]),
	);

	const toolApproval = Object.fromEntries(
		registry
			.list()
			.filter((c) => c.requiresApproval)
			.map((c) => [c.name, "user-approval" as const]),
	);

	const { text, steps: rawSteps } = await generateText({
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

	return { text, toolsCalled, pendingApprovals, steps };
}
