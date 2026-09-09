import { env } from "@aevryn/env/server";
import {
	Mem0MemoryStore,
	type MemoryCategory,
	memoryCategorySchema,
} from "@aevryn/workflow";
import { z } from "zod";

import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const storeMemoryInputSchema = z.object({
	text: z
		.string()
		.min(1)
		.max(4000)
		.describe(
			"A concise, self-contained, reusable fact, conclusion, or strategy.",
		),
	category: memoryCategorySchema
		.default("semantic")
		.describe(
			"episodic for events that happened, semantic for facts/knowledge, " +
				"procedural for successful step-by-step strategies, working for " +
				"short-lived context.",
		),
});

export function createStoreMemoryCapability(
	userId: string,
	workflowId: string,
): Capability {
	const store = new Mem0MemoryStore(env.MEM0_API_KEY);
	const schema = storeMemoryInputSchema;
	return {
		name: "storeMemory",
		description:
			"Persist a piece of knowledge to long-term memory, scoped to the user and " +
			"this workflow. Use for reusable facts about the user/topic, and especially " +
			"for successful strategies (how to reach a site, what method worked) that " +
			"future runs should reuse. Do not store secrets or credentials.",
		inputSchema: schema,
		async execute(input) {
			const parsed = schema.safeParse(input);
			if (!parsed.success) {
				return {
					ok: false,
					error: {
						code: "INVALID_CAPABILITY_INPUT",
						message: parsed.error.message,
						failureClass: "fatal",
						retryable: false,
					},
				};
			}
			try {
				const stored = await store.store({
					userId,
					workflowId,
					text: parsed.data.text,
					category: parsed.data.category as MemoryCategory,
				});
				return { ok: true, data: stored };
			} catch (error) {
				return toCapabilityFailure(error, 0);
			}
		},
	};
}
