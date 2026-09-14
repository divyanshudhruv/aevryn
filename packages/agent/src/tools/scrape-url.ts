import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema } from "./context";
import {
	anakinGet,
	anakinPost,
	isValidCountry,
	type ToolResult,
} from "./anakin-client";

export type { ToolContext } from "./context";

const SCRAPE_FORMATS = [
	"markdown",
	"html",
	"cleanedHtml",
	"json",
	"links",
	"images",
	"screenshot",
	"screenshotFullPage",
	"summary",
] as const;

export interface InlineDocument {
	id: string;
	status: string;
	url: string;
	markdown?: string;
	html?: string;
	cleanedHtml?: string;
	links?: string[];
	images?: string[];
	summary?: string;
	generatedJson?: Record<string, unknown>;
	screenshotUrl?: string;
	fullPageScreenshotUrl?: string;
	cached?: boolean;
	durationMs?: number;
	error?: string | null;
}

interface ScrapeBody extends Record<string, unknown> {
	url: string;
	formats?: string[];
	country?: string;
	useBrowser?: boolean;
	generateJson?: boolean;
	outputSchema?: Record<string, unknown>;
	forceFresh?: boolean;
	sessionId?: string;
}

const inputSchema = z.object({
	url: z.string().url().describe("The page to scrape (HTTP/HTTPS)."),
	formats: z
		.array(z.enum(SCRAPE_FORMATS))
		.max(9)
		.optional()
		.describe("Outputs to produce. Default: markdown."),
	useBrowser: z
		.boolean()
		.optional()
		.describe("Headless Chrome for JS-heavy sites (default false)."),
	outputSchema: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"JSON Schema of fields to AI-extract (+2 credits, implies generateJson).",
		),
	country: z
		.string()
		.length(2)
		.optional()
		.describe("ISO-2 proxy country, e.g. 'us', 'in'."),
	forceFresh: z
		.boolean()
		.optional()
		.describe("Skip the 24h cache (results are otherwise free when cached)."),
	sessionId: z
		.string()
		.optional()
		.describe("Browser session id for authenticated pages."),
});

export const scrapeUrlTool = tool({
	description:
		"Scrape ONE page and get its content inline (markdown by default). Works without an API key. Costs 1 credit (2 with JSON extraction); free if the URL was scraped in the last 24h unless forceFresh. For 2–10 pages use scrapeBatch; for a whole site use crawlSite; for just the URL list use mapSite.",
	inputSchema,
	// Zero Touch: no context key required.
	contextSchema: toolContextSchema,
	execute: async (input, { context }): Promise<ToolResult<{ document: InlineDocument }>> => {
		try {
			if (input.country && !(await isValidCountry(input.country))) {
				return {
					ok: false,
					error: {
						code: "INVALID_COUNTRY",
						message: `Country '${input.country}' is not in Anakin's supported list.`,
					},
				};
			}

			const body: ScrapeBody = {
				url: input.url,
				formats: input.formats ?? ["markdown"],
				useBrowser: input.useBrowser ?? false,
			};
			if (input.country) body.country = input.country;
			if (input.outputSchema) {
				body.outputSchema = input.outputSchema;
				body.generateJson = true;
			}
			if (input.forceFresh != null) body.forceFresh = input.forceFresh;
			if (input.sessionId) body.sessionId = input.sessionId;

			const { status, body: document } = await anakinPost<InlineDocument>(
				"/url-scraper/scrape",
				body,
				context.anakinKey,
				120_000, // inline endpoint blocks up to ~90s; give headroom
			);

			if (status === 202 || (document.status !== "completed" && document.status !== "failed")) {
				// Non-terminal: poll the same job id until terminal.
				const polled = await pollScrapeJob(document.id, context.anakinKey);
				return { ok: true, document: polled };
			}

			return { ok: true, document };
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "SCRAPE_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});

async function pollScrapeJob(
	jobId: string,
	apiKey: string | null,
	maxAttempts = 90,
): Promise<InlineDocument> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const { body } = await anakinGet<InlineDocument>(
			`/url-scraper/${jobId}`,
			undefined,
			apiKey,
		);
		if (body.status === "completed" || body.status === "failed") return body;
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	}
	throw new Error(`Scrape job ${jobId} did not settle within the poll window.`);
}
