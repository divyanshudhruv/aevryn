import { z } from "zod";
import type { ScrapeAdapter, ScrapeFormat } from "../adapters/scrape";
import type { Capability } from "../capability";
import { toCapabilityFailure } from "../errors";

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
	forceFresh: z.boolean().optional(),
	sessionId: z.string().optional(),
	sessionName: z.string().optional(),
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
						failureClass: "fatal",
						retryable: false,
					},
				};
			}
			const startedAt = performance.now();
			try {
				const result = await adapter.scrape(parsed.data.url, {
					formats: parsed.data.formats as ScrapeFormat[] | undefined,
					useBrowser: parsed.data.useBrowser,
					generateJson: parsed.data.generateJson,
					forceFresh: parsed.data.forceFresh,
					sessionId: parsed.data.sessionId,
					sessionName: parsed.data.sessionName,
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
