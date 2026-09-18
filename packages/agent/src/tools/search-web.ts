import { tool } from "ai";
import { z } from "zod";
import { wrapUntrustedMaybe } from "../untrusted";
import {
	anakinClient,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import { type ToolContext, toolContextSchema } from "./context";

const inputSchema = z.object({
	prompt: z.string().min(1).max(8_192),
	limit: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe("Max results (default 5, max 20)."),
});

export const searchWebTool = tool({
	description:
		"Search web for fresh info. Ranked results: title, URL, snippet, date. 3 credits. Needs API key. Deep reports: researchTopic.",
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
				lastUpdated?: string;
			}>;
		}>
	> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;

		try {
			const client = anakinClient(key.apiKey);
			const result = await client.search(input.prompt, {
				limit: input.limit ?? 5,
			});
			return {
				ok: true,
				results: result.results.map((item) => ({
					url: item.url,
					title: wrapUntrustedMaybe(item.title),
					snippet: wrapUntrustedMaybe(item.snippet),
					date: item.date,
					lastUpdated: item.lastUpdated,
				})),
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
