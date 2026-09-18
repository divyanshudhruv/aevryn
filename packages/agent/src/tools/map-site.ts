import { tool } from "ai";
import { z } from "zod";

import { checkExternalUrl } from "../ssrf-guard";
import { anakinClient, mapAnakinError, type ToolResult } from "./anakin-client";
import { type ToolContext, toolContextSchema } from "./context";

const inputSchema = z.object({
	url: z.string().url(),
	searchQuery: z
		.string()
		.optional()
		.describe("Filter mapped URLs by a search term (maps to `search`)."),
	includeSubdomains: z
		.boolean()
		.optional()
		.describe("Include subdomains (default false)."),
	includeExternalLinks: z
		.boolean()
		.optional()
		.describe("Also collect links to other domains (default false)."),
	depth: z
		.number()
		.int()
		.min(1)
		.max(5)
		.optional()
		.describe("Link hops from the seed (default 2, max 5)."),
	limitPerLevel: z
		.number()
		.int()
		.min(1)
		.max(500)
		.optional()
		.describe(
			"Max pages fetched per depth level beyond the seed (default 100, max 500).",
		),
	limit: z
		.number()
		.int()
		.min(1)
		.max(5_000)
		.optional()
		.describe("Max URLs returned (default 100, max 5000)."),
	useBrowser: z
		.boolean()
		.optional()
		.describe(
			"Render the page in headless Chrome before extracting links (default false).",
		),
	sessionId: z.string().optional().describe("Browser session id."),
});

export const mapSiteTool = tool({
	description:
		"List site URLs, up to 5000. No page content. Needs API key. Cheap: plan crawl or find pages before scraping. Breadth: depth, per-level limits, external links.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			links: string[];
			totalLinks: number;
			externalLinks: string[];
			totalExternalLinks?: number;
		}>
	> => {
		if (!context.anakinKey) {
			return {
				ok: false,
				error: {
					code: "ANAKIN_KEY_REQUIRED",
					message:
						"Site mapping needs your Anakin API key (Settings → BYOK). Single pages work keyless via scrapeUrl.",
				},
			};
		}
		try {
			const urlVerdict = checkExternalUrl(input.url);
			if (urlVerdict.blocked) {
				return {
					ok: false,
					error: {
						code: "URL_BLOCKED",
						message: `Cannot map '${input.url}': ${urlVerdict.reason}`,
					},
				};
			}

			const client = anakinClient(context.anakinKey);
			const result = await client.map(input.url, {
				limit: input.limit ?? 100,
				depth: input.depth,
				limitPerLevel: input.limitPerLevel,
				includeSubdomains: input.includeSubdomains,
				includeExternalLinks: input.includeExternalLinks,
				...(input.searchQuery ? { search: input.searchQuery } : {}),
				useBrowser: input.useBrowser,
				sessionId: input.sessionId,
				pollTimeoutMs: 5 * 60_000,
			});
			return {
				ok: true,
				links: result.links,
				totalLinks: result.totalLinks,
				externalLinks: result.externalLinks,
				totalExternalLinks: result.totalExternalLinks,
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
