import { memoryCategorySchema, memoryService } from "@aevryn/workflow";
import { z } from "zod";

import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const searchMemoryInputSchema = z.object({
	query: z
		.string()
		.min(1)
		.max(500)
		.describe("A natural-language question about what you want to recall."),
	limit: z.number().int().min(1).max(10).default(3),
	categories: z.array(memoryCategorySchema).max(4).optional(),
});

export function createSearchMemoryCapability(
	userId: string,
	workflowId: string,
): Capability {
	const store = memoryService;
	const schema = searchMemoryInputSchema;
	return {
		name: "searchMemory",
		description:
			"Retrieve previously stored memories (facts, preferences, or strategies you " +
			"saved earlier) that are relevant to a question. Memories are scoped to the " +
			"user; use this before re-discovering something you may already know, and " +
			"when a previous run left a reusable approach for reaching a site or target.",
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
				const entries = await store.search({
					userId,
					query: parsed.data.query,
					limit: parsed.data.limit,
					categories: parsed.data.categories,
				});
				return {
					ok: true,
					data: {
						workflowId,
						entries: entries.map((entry) => ({
							memoryId: entry.id,
							category: entry.category,
							text: entry.text,
							score: entry.score ?? null,
						})),
					},
				};
			} catch (error) {
				return toCapabilityFailure(error, 0);
			}
		},
	};
}
