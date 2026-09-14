import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinClient,
	isValidCountry,
	mapAnakinError,
	type ToolResult,
} from "./anakin-client";

const inputSchema = z.object({
	url: z.string().url().describe("The site/page to start crawling from."),
	maxPages: z
		.number()
		.int()
		.min(1)
		.max(100)
		.optional()
		.describe("Max pages to crawl (default 10, max 100). ~1 credit/page."),
	depth: z
		.number()
		.int()
		.min(1)
		.max(5)
		.optional()
		.describe("Link-follow depth (max 5)."),
	includePatterns: z
		.array(z.string())
		.optional()
		.describe("Glob patterns the URL must match."),
	excludePatterns: z
		.array(z.string())
		.optional()
		.describe("Glob patterns to skip."),
	country: z.string().length(2).optional().describe("ISO-2 proxy country."),
	sessionId: z.string().optional().describe("Browser session id."),
});

export const crawlSiteTool = tool({
	description:
		"Crawl many pages of ONE site and get each page's markdown (≈1 credit/page, max 100 pages). Requires an API key. For a list of URLs only (no content) use mapSite — it's cheaper.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			pages: Array<{
				url: string;
				status: string;
				markdown?: string;
				error?: string;
			}>;
			totalPages: number;
			completedPages: number;
		}>
	> => {
		if (!context.anakinKey) {
			return {
				ok: false,
				error: {
					code: "ANAKIN_KEY_REQUIRED",
					message:
						"Crawling needs your Anakin API key (Settings → BYOK). Single pages work keyless via scrapeUrl.",
				},
			};
		}
		try {
			if (input.country && !(await isValidCountry(input.country))) {
				return {
					ok: false,
					error: {
						code: "INVALID_COUNTRY",
						message: `Country '${input.country}' is not supported by Anakin.`,
					},
				};
			}

			const client = anakinClient(context.anakinKey);
			const result = await client.crawl(input.url, {
				maxPages: input.maxPages ?? 10,
				depth: input.depth,
				includePatterns: input.includePatterns,
				excludePatterns: input.excludePatterns,
				country: input.country,
				sessionId: input.sessionId,
				pollTimeoutMs: 10 * 60_000,
			});

			return {
				ok: true,
				pages: result.pages.map((page) => ({
					url: page.url,
					status: page.status,
					markdown: page.markdown,
					error: page.error,
				})),
				totalPages: result.totalPages,
				completedPages: result.completedPages,
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
