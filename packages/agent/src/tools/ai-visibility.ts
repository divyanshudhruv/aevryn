import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	requireKey,
	anakinPost,
	anakinGet,
	type ToolResult,
} from "./anakin-client";

const inputSchema = z.object({
	query: z
		.string()
		.min(1)
		.max(2_000)
		.describe("The prompt sent verbatim to every selected AI engine."),
	sources: z
		.array(z.enum(["chatgpt", "gemini", "google-ai-overview"]))
		.optional()
		.describe("Engines to query. Omit for all enabled sources."),
	country: z
		.string()
		.length(2)
		.optional()
		.describe("ISO-2 search geography (default 'us'). Answers vary by region."),
});

export interface VisibilitySourceResult {
	source: string;
	status: string;
	summary?: string;
	latencyMs?: number;
	creditsUsed?: number;
	verdict?: string;
	error?: string;
}

export const aiVisibilityTool = tool({
	description:
		"Ask multiple AI engines (ChatGPT, Gemini, Google AI Overview) the same question and compare their answers, with per-engine latency and an automatic consensus summary. Requires an API key. Takes ~10–60s; results arrive per engine. Never cached — every run queries fresh.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			synthesis?: string;
			results: VisibilitySourceResult[];
		}>
	> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;

		try {
			const submitBody: Record<string, unknown> = { query: input.query };
			if (input.sources) submitBody.sources = input.sources;
			if (input.country) submitBody.country = input.country;

			const { body: submitted } = await anakinPost<{ search_id?: string; status?: string }>(
				"/ai-visibility/search",
				submitBody,
				key.apiKey,
				30_000,
			);
			if (!submitted.search_id) {
				return {
					ok: false,
					error: {
						code: "VISIBILITY_SUBMIT_FAILED",
						message: "Anakin did not return a search_id for the AI visibility run.",
					},
				};
			}

			// Poll @3s, up to ~10 minutes (run auto-fails after 10).
			const deadline = Date.now() + 10 * 60_000;
			let final: {
				status?: string;
				synthesis?: string;
				results?: VisibilitySourceResult[];
			} = {};

			while (Date.now() < deadline) {
				const { body } = await anakinGet<typeof final>(
					`/ai-visibility/search/${submitted.search_id}`,
					undefined,
					key.apiKey,
				);
				final = body;
				if (body.status === "completed" || body.status === "failed") break;
				await new Promise((resolve) => setTimeout(resolve, 3_000));
			}

			return {
				ok: true,
				synthesis: final.synthesis,
				results: final.results ?? [],
			};
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "VISIBILITY_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});
