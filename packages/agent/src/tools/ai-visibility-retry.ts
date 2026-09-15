import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinPost,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import type { VisibilitySourceResult } from "./ai-visibility";

const inputSchema = z.object({
	searchId: z
		.string()
		.min(1)
		.describe("The AI Visibility run whose source should be re-run."),
	source: z
		.string()
		.min(1)
		.describe("The source slug to re-run (from the run's results or aiVisibilitySources)."),
});

interface ApiRetryResult extends Record<string, unknown> {
	source?: string;
	status?: string;
	summary?: string;
	full_content?: string;
	latency_ms?: number;
	credits_used?: number;
	verdict?: string;
	error?: string;
}

function mapResult(item: ApiRetryResult): VisibilitySourceResult {
	return {
		source: typeof item.source === "string" ? item.source : "unknown",
		status: typeof item.status === "string" ? item.status : "failed",
		summary: typeof item.summary === "string" ? item.summary : undefined,
		fullContent: typeof item.full_content === "string" ? item.full_content : undefined,
		latencyMs: typeof item.latency_ms === "number" ? item.latency_ms : undefined,
		creditsUsed: typeof item.credits_used === "number" ? item.credits_used : undefined,
		verdict: typeof item.verdict === "string" ? item.verdict : undefined,
		error: typeof item.error === "string" ? item.error : undefined,
	};
}

export const aiVisibilityRetryTool = tool({
	description:
		"Re-run ONE failed or timed-out source of an existing AI Visibility search and return its fresh answer (synchronous, ~10–60s). Requires an API key. A timed-out source whose engine actually finished is adopted without re-billing; a genuinely fresh re-run bills again. Only the retried source's result is replaced.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ result: VisibilitySourceResult }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const { body } = await anakinPost<ApiRetryResult>(
				`/ai-visibility/search/${input.searchId}/retry`,
				{ source: input.source },
				key.apiKey,
				120_000,
			);
			return { ok: true, result: mapResult(body) };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
