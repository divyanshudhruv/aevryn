import { z } from "zod";
import type { ResearchAdapter } from "../adapters/research";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const researchTopicInputSchema = z.object({
	prompt: z.string().min(1),
	useBrowser: z.boolean().optional(),
	schema: z.record(z.string(), z.unknown()).optional(),
});

export function createResearchTopicCapability(
	adapter: ResearchAdapter,
): Capability {
	return {
		name: "researchTopic",
		description:
			"Run an agentic research query that plans, searches, reads, verifies, and " +
			"answers with citations across many sources. Returns a synthesized summary " +
			"and optionally structured data. Use for multi-step factual research rather " +
			"than a single search.",
		inputSchema: researchTopicInputSchema,
		async execute(input) {
			const parsed = researchTopicInputSchema.safeParse(input);
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
			const startedAt = performance.now();
			try {
				const result = await adapter.research(parsed.data.prompt, {
					useBrowser: parsed.data.useBrowser,
					schema: parsed.data.schema,
				});
				return {
					ok: true,
					data: result,
					provider: {
						id: adapter.name,
						durationMs: performance.now() - startedAt,
					},
				};
			} catch (error) {
				return toCapabilityFailure(error, performance.now() - startedAt);
			}
		},
	};
}
