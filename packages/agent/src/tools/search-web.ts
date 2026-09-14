import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinClient,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";

const inputSchema = z.object({
	prompt: z.string().min(1).max(8_192).describe("What to search the web for."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe("Max results (default 10, max 20)."),
});

export const searchWebTool = tool({
	description:
		"Web search with ranked results (title, URL, snippet, date). Costs 3 Anakin credits; requires an API key. Use when the user needs fresh web information. For deep multi-source reports use researchTopic instead.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			results: Array<{
				url: string;
				title?: string;
				snippet?: string;
				date?: string;
			}>;
		}>
	> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;

		try {
			const client = anakinClient(key.apiKey);
			const result = await client.search(input.prompt, {
				limit: input.limit ?? 10,
			});
			return {
				ok: true,
				results: result.results.map((item) => ({
					url: item.url,
					title: item.title,
					snippet: item.snippet,
					date: item.date ?? item.lastUpdated,
				})),
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
