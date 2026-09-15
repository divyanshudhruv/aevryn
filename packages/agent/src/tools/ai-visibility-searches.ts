import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinGet,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import type { VisibilitySourceStatus } from "./ai-visibility";

export interface VisibilitySearchSummary {
	searchId: string;
	query?: string;
	status?: string;
	createdAt?: string;
	creditsUsed?: number;
	sources: Array<{ source: string; status: VisibilitySourceStatus | string }>;
}

interface ApiSearchSummary extends Record<string, unknown> {
	search_id?: string;
	query?: string;
	status?: string;
	created_at?: string;
	credits_used?: number;
	sources?: Array<Record<string, unknown>>;
}

export const aiVisibilitySearchesTool = tool({
	description:
		"List your 20 most recent AI Visibility runs with per-source statuses and total credit cost. Requires an API key. Use it to recover results for runs that finished after a disconnect, then fetch full answers with aiVisibility on the same question.",
	inputSchema: z.object({}),
	contextSchema: toolContextSchema,
	execute: async (
		_input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ searches: VisibilitySearchSummary[] }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const { body } = await anakinGet<{ searches?: ApiSearchSummary[] }>(
				"/ai-visibility/searches",
				undefined,
				key.apiKey,
			);
			const searches = (body.searches ?? [])
				.filter(
					(s): s is ApiSearchSummary & { search_id: string } =>
						s != null &&
						typeof s === "object" &&
						typeof s.search_id === "string",
				)
				.map((s) => ({
					searchId: s.search_id,
					query: typeof s.query === "string" ? s.query : undefined,
					status: typeof s.status === "string" ? s.status : undefined,
					createdAt: typeof s.created_at === "string" ? s.created_at : undefined,
					creditsUsed:
						typeof s.credits_used === "number" ? s.credits_used : undefined,
					sources: (s.sources ?? [])
						.filter(
							(r): r is Record<string, unknown> & { source: string } =>
								r != null &&
								typeof r === "object" &&
								typeof r.source === "string",
						)
						.map((r) => ({
							source: r.source,
							status:
								typeof r.status === "string" ? r.status : "failed",
						})),
				}));
			return { ok: true, searches };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
