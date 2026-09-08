import { z } from "zod";
import type { CrawlAdapter } from "../adapters/crawl";
import type { Capability } from "../capability";

const crawlSiteInputSchema = z.object({
	url: z.string().url(),
	maxPages: z.number().int().positive().max(100).optional(),
	depth: z.number().int().positive().max(10).optional(),
	includePatterns: z.array(z.string()).max(20).optional(),
	excludePatterns: z.array(z.string()).max(20).optional(),
});

export function createCrawlSiteCapability(adapter: CrawlAdapter): Capability {
	return {
		name: "crawlSite",
		description:
			"Recursively crawl a website starting from a URL. Returns every page " +
			"discovered up to maxPages with its Markdown content. Use when you need " +
			"to explore multiple pages of a site, not just one.",
		inputSchema: crawlSiteInputSchema,
		async execute(input) {
			const parsed = crawlSiteInputSchema.safeParse(input);
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
				const result = await adapter.crawl(parsed.data.url, {
					maxPages: parsed.data.maxPages,
					depth: parsed.data.depth,
					includePatterns: parsed.data.includePatterns,
					excludePatterns: parsed.data.excludePatterns,
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
