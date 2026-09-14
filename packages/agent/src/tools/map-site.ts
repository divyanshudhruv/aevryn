import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinClient,
	mapAnakinError,
	type ToolResult,
} from "./anakin-client";

const inputSchema = z.object({
	url: z.string().url().describe("Site root or starting page to map."),
	searchQuery: z
		.string()
		.optional()
		.describe("Filter mapped URLs by a search term (maps to `search`)."),
	includeSubdomains: z.boolean().optional().describe("Include subdomains (default false)."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(5_000)
		.optional()
		.describe("Max URLs returned (default 1000, max 5000)."),
});

export const mapSiteTool = tool({
	description:
		"List the URLs of a website (up to 5000) without scraping page content. Requires an API key. Cheap — use it to plan a crawl or find specific pages before scraping them individually.",
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
			const client = anakinClient(context.anakinKey);
			const result = await client.map(input.url, {
				limit: input.limit ?? 1_000,
				includeSubdomains: input.includeSubdomains ?? false,
				...(input.searchQuery ? { search: input.searchQuery } : {}),
				pollTimeoutMs: 5 * 60_000,
			});
			return {
				ok: true,
				links: result.links,
				totalLinks: result.totalLinks,
				externalLinks: result.externalLinks,
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
