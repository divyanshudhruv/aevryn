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

export interface AgentResult {
	text: string;
	toolsCalled: string[];
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

	const { text, steps } = await generateText({
		model: groq.languageModel(model),
		tools,
		stopWhen: isStepCount(maxSteps),
		prompt: objective,
	});

	const toolsCalled = steps.flatMap((step) =>
		step.toolCalls.map((call) => call.toolName),
	);

	return { text, toolsCalled };
}
