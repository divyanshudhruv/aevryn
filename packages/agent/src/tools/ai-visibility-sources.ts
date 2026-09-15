import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinGet,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";

export interface VisibilitySource {
	slug: string;
	label?: string;
}

export const aiVisibilitySourcesTool = tool({
	description:
		"List the AI engines currently available for aiVisibility searches (ChatGPT, Gemini, Google AI Overview, …). Requires an API key. Free. The roster is managed platform-side — call this when unsure which source slugs to pass to aiVisibility.",
	inputSchema: z.object({}),
	contextSchema: toolContextSchema,
	execute: async (
		_input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ sources: VisibilitySource[] }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const { body } = await anakinGet<{ sources?: Array<Record<string, unknown>> }>(
				"/ai-visibility/sources",
				undefined,
				key.apiKey,
			);
			const sources = (body.sources ?? [])
				.filter(
					(s): s is Record<string, unknown> & { slug: string } =>
						s != null && typeof s === "object" && typeof s.slug === "string",
				)
				.map((s) => ({
					slug: s.slug,
					label: typeof s.label === "string" ? s.label : undefined,
				}));
			return { ok: true, sources };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
