import { z } from "zod";
import type { SearchAdapter } from "../adapters/search";
import type { Capability, CapabilityProvider } from "../capability";
import { toCapabilityFailure } from "../errors";

const searchWebInputSchema = z.object({
	query: z.string().min(1),
	limit: z.number().int().positive().max(20).optional(),
});

const searchWebOutputSchema = z.object({
	id: z.string(),
	results: z.array(
		z.object({
			url: z.string(),
			title: z.string().optional(),
			snippet: z.string().optional(),
			date: z.string().optional(),
			lastUpdated: z.string().optional(),
		}),
	),
});

export function createSearchWebCapability(adapter: SearchAdapter): Capability {
	return {
		name: "searchWeb",
		description:
			"Search the public web for up-to-date information about a topic. " +
			"Accepts a natural-language query and returns a list of matching URLs " +
			"with titles and snippets.",
		inputSchema: searchWebInputSchema,
		outputSchema: searchWebOutputSchema,
		async execute(input) {
			const parsed = searchWebInputSchema.safeParse(input);
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
				const result = await adapter.search(parsed.data.query, {
					limit: parsed.data.limit,
				});
				const output = searchWebOutputSchema.safeParse(result);
				if (!output.success) {
					return {
						ok: false,
						error: {
							code: "INVALID_CAPABILITY_OUTPUT",
							message: output.error.message,
							failureClass: "fatal",
							retryable: false,
						},
						provider: {
							id: adapter.name,
							durationMs: performance.now() - startedAt,
						},
					};
				}
				const provider: CapabilityProvider = {
					id: adapter.name,
					durationMs: performance.now() - startedAt,
				};
				return { ok: true, data: output.data, provider };
			} catch (error) {
				return toCapabilityFailure(error, performance.now() - startedAt);
			}
		},
	};
}
