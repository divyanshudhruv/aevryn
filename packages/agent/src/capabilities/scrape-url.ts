import { z } from "zod";
import type { ScrapeAdapter, ScrapeFormat } from "../adapters/scrape";
import type { Capability } from "../capability";

const scrapeUrlInputSchema = z.object({
	url: z.string().url(),
	formats: z
		.array(
			z.enum([
				"markdown",
				"html",
				"cleanedHtml",
				"json",
				"links",
				"images",
				"screenshot",
				"screenshotFullPage",
				"summary",
			]),
		)
		.max(9)
		.optional(),
	useBrowser: z.boolean().optional(),
	generateJson: z.boolean().optional(),
});

export function createScrapeUrlCapability(adapter: ScrapeAdapter): Capability {
	return {
		name: "scrapeUrl",
		description:
			"Scrape the full content of a single URL and return it as Markdown, HTML, " +
			"JSON, links, images, or a screenshot. Use when you need the actual page " +
			"content behind a link, not just search snippets.",
		inputSchema: scrapeUrlInputSchema,
		async execute(input) {
			const parsed = scrapeUrlInputSchema.safeParse(input);
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
				const result = await adapter.scrape(parsed.data.url, {
					formats: parsed.data.formats as ScrapeFormat[] | undefined,
					useBrowser: parsed.data.useBrowser,
					generateJson: parsed.data.generateJson,
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
