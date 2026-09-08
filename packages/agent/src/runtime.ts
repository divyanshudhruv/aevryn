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

export interface AgentResult {
	text: string;
	toolsCalled: string[];
	pendingApprovals: PendingApproval[];
}

export async function runAgent(
	options: AgentRuntimeOptions,
): Promise<AgentResult> {
	const { registry, objective, maxSteps = 5, model = env.GROQ_MODEL } = options;

	const groq = createGroq({ apiKey: env.GROQ_API_KEY });

	const tools = Object.fromEntries(
		registry.list().map((capability) => [
			capability.name,
			tool({
				description: capability.description,
				inputSchema: capability.inputSchema,
				execute: async (input) => {
					const result = await capability.execute(input);
					if (!result.ok) {
						throw new Error(`${result.error.code}: ${result.error.message}`);
					}
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

	const { text, steps } = await generateText({
		model: groq.languageModel(model),
		tools,
		toolApproval,
		stopWhen: isStepCount(maxSteps),
		prompt: objective,
	});

	const toolsCalled = steps.flatMap((step) =>
		step.toolCalls.map((call) => call.toolName),
	);

	const pendingApprovals: PendingApproval[] = steps.flatMap((step) =>
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

	return { text, toolsCalled, pendingApprovals };
}
