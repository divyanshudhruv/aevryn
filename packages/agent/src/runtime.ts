import { env } from "@aevryn/env/server";
import { createGroq } from "@ai-sdk/groq";
import { generateText, isStepCount, tool } from "ai";

import type { CapabilityRegistry } from "./capability";

export interface AgentRuntimeOptions {
	registry: CapabilityRegistry;
	objective: string;
	maxSteps?: number;
	model?: string;
}

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

export async function runAgent(
	options: AgentRuntimeOptions,
): Promise<AgentResult> {
	const { registry, objective, maxSteps = 5, model = env.GROQ_MODEL } = options;

	const groq = createGroq({ apiKey: env.GROQ_API_KEY });

	const executionRecords = new Map<string, CallExecutionRecord>();

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
						throw new Error(`${result.error.code}: ${result.error.message}`);
					}
					record.status = "completed";
					record.output = result.data;
					record.provider = result.provider ?? {
						id: capability.name,
						durationMs: elapsedMs,
					};
					return result.data;
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
		tools,
		toolApproval,
		stopWhen: isStepCount(maxSteps),
		prompt: objective,
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
