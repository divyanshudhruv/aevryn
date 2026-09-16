import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import { wrapUntrustedMaybe } from "../untrusted";
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
		.array(z.string())
		.optional()
		.describe(
			"Source slugs to query (see aiVisibilitySources for the live roster). Omit for all enabled sources.",
		),
	country: z
		.string()
		.length(2)
		.optional()
		.describe("ISO-2 search geography (default 'us'). Answers vary by region."),
});

export type VisibilitySourceStatus = "completed" | "failed" | "timed_out";

export interface VisibilitySourceResult {
	source: string;
	status: VisibilitySourceStatus | string;
	summary?: string;
	fullContent?: string;
	latencyMs?: number;
	creditsUsed?: number;
	verdict?: string;
	error?: string;
}

interface ApiSourceResult extends Record<string, unknown> {
	source?: string;
	status?: string;
	summary?: string;
	full_content?: string;
	latency_ms?: number;
	credits_used?: number;
	verdict?: string;
	error?: string;
}

function mapSourceResult(item: ApiSourceResult): VisibilitySourceResult {
	return {
		source: typeof item.source === "string" ? item.source : "unknown",
		status: typeof item.status === "string" ? item.status : "failed",
		summary: wrapUntrustedMaybe(
			typeof item.summary === "string" ? item.summary : undefined,
		),
		fullContent: wrapUntrustedMaybe(
			typeof item.full_content === "string" ? item.full_content : undefined,
		),
		latencyMs: typeof item.latency_ms === "number" ? item.latency_ms : undefined,
		creditsUsed: typeof item.credits_used === "number" ? item.credits_used : undefined,
		verdict: wrapUntrustedMaybe(
			typeof item.verdict === "string" ? item.verdict : undefined,
		),
		error: typeof item.error === "string" ? item.error : undefined,
	};
}

export const aiVisibilityTool = tool({
	description:
		"Ask multiple AI engines (ChatGPT, Gemini, Google AI Overview, …) same question, compare answers. Per-engine latency, consensus synthesis. Needs API key. ~10–60s. Per-engine results. Never cached.",
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
			// Runtime validation against the live roster — the schema is a plain
			// string[] because the platform adds engines without code releases.
			let sources = input.sources;
			if (sources && sources.length > 0) {
				const { body } = await anakinGet<{ sources?: Array<{ slug?: unknown }> }>(
					"/ai-visibility/sources",
					undefined,
					key.apiKey,
				);
				const roster = (body.sources ?? [])
					.map((s) => (typeof s?.slug === "string" ? s.slug : null))
					.filter((s): s is string => s != null);
				if (roster.length > 0) {
					const unknown = sources.filter((s) => !roster.includes(s));
					if (unknown.length > 0) {
						return {
							ok: false,
							error: {
								code: "INVALID_REQUEST",
								message: `Unknown AI visibility source${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Available: ${roster.join(", ")}.`,
							},
						};
					}
				}
			}

			const submitBody: Record<string, unknown> = { query: input.query };
			if (sources && sources.length > 0) submitBody.sources = sources;
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
				results?: ApiSourceResult[];
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

			const failed = final.status === "failed";
			return {
				ok: !failed,
				...(failed
					? {
							error: {
								code: "VISIBILITY_FAILED",
								message:
									"Every AI visibility source failed. Retry individual sources with aiVisibilityRetry.",
							},
						}
					: {
							synthesis: wrapUntrustedMaybe(final.synthesis),
							results: (final.results ?? []).map(mapSourceResult),
						}),
			} as ToolResult<{ synthesis?: string; results: VisibilitySourceResult[] }>;
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
