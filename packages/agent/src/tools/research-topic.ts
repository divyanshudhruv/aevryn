import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinClient,
	mapAnakinError,
	type ToolResult,
} from "./anakin-client";

const inputSchema = z.object({
	prompt: z
		.string()
		.min(1)
		.max(8_192)
		.describe("The research question or topic."),
});

export const researchTopicTool = tool({
	description:
		"Deep multi-source research report (searches the web, scrapes the best citations, and synthesizes an analysis). Costs 10 Anakin credits + 1 per cited URL; requires an API key. Takes 1–5 minutes — announce that you're starting it and narrate the wait. For a quick ranked list of links use searchWeb (3 credits) instead.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<
		ToolResult<{
			summary?: string;
			structuredData?: Record<string, unknown>;
		}>
	> => {
		if (!context.anakinKey) {
			return {
				ok: false,
				error: {
					code: "ANAKIN_KEY_REQUIRED",
					message:
						"Deep research needs your Anakin API key (Settings → BYOK). searchWeb also covers quick lookups (still keyed).",
				},
			};
		}
		try {
			const client = anakinClient(context.anakinKey);
			const result = await client.agenticSearch(input.prompt, {
				pollTimeoutMs: 10 * 60_000,
			});

			if (result.status === "failed") {
				return {
					ok: false,
					error: {
						code: "RESEARCH_FAILED",
						message: result.error ?? "The research job failed on Anakin's side.",
					},
				};
			}

			return {
				ok: true,
				summary: result.generatedJson?.summary,
				structuredData: result.generatedJson?.structured_data,
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
