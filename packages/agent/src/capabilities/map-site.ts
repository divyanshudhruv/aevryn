import { z } from "zod";
import type { MapAdapter } from "../adapters/map";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

const mapSiteInputSchema = z.object({
	url: z.string().url(),
	limit: z.number().int().positive().max(5000).optional(),
	depth: z.number().int().positive().max(10).optional(),
	limitPerLevel: z.number().int().positive().max(1000).optional(),
	includeSubdomains: z.boolean().optional(),
	includeExternalLinks: z.boolean().optional(),
	search: z.string().max(500).optional(),
	useBrowser: z.boolean().optional(),
	sessionId: z.string().optional(),
});

export function createMapSiteCapability(adapter: MapAdapter): Capability {
	return {
		name: "mapSite",
		description:
			"Discover every URL on a domain. Returns the full list of internal and " +
			"external links found from sitemap, robots.txt, and page discovery. Use " +
			"when you need an inventory of a site's pages before deeper investigation.",
		inputSchema: mapSiteInputSchema,
		async execute(input) {
			const parsed = mapSiteInputSchema.safeParse(input);
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
				const result = await adapter.map(parsed.data.url, {
					limit: parsed.data.limit,
					depth: parsed.data.depth,
					limitPerLevel: parsed.data.limitPerLevel,
					includeSubdomains: parsed.data.includeSubdomains,
					includeExternalLinks: parsed.data.includeExternalLinks,
					search: parsed.data.search,
					useBrowser: parsed.data.useBrowser,
					sessionId: parsed.data.sessionId,
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
