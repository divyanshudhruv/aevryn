import { z } from "zod";
import type { MapAdapter } from "../adapters/map";
import type { Capability } from "../capability";

const mapSiteInputSchema = z.object({
	url: z.string().url(),
	limit: z.number().int().positive().max(5000).optional(),
	depth: z.number().int().positive().max(10).optional(),
	includeSubdomains: z.boolean().optional(),
	includeExternalLinks: z.boolean().optional(),
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
					},
				};
			}
			try {
				const result = await adapter.map(parsed.data.url, {
					limit: parsed.data.limit,
					depth: parsed.data.depth,
					includeSubdomains: parsed.data.includeSubdomains,
					includeExternalLinks: parsed.data.includeExternalLinks,
				});
				return { ok: true, data: result };
			} catch (error) {
				return {
					ok: false,
					error: {
						code: "CAPABILITY_EXECUTION_FAILED",
						message: error instanceof Error ? error.message : "Unknown error",
					},
				};
			}
		},
	};
}
