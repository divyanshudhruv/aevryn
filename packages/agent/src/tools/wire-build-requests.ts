import { tool } from "ai";
import { z } from "zod";
import {
	anakinGet,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
import { type ToolContext, toolContextSchema } from "./context";
import type { BuildRequestResult } from "./wire-build-request";

interface ApiBuildRequest extends Record<string, unknown> {
	id?: unknown;
	status?: unknown;
	domain?: unknown;
	website_url?: unknown;
	credits_charged?: unknown;
	action_id?: unknown;
	error?: unknown;
	created_at?: unknown;
	updated_at?: unknown;
}

export const wireBuildRequestsTool = tool({
	description:
		"List Wire build requests. Lifecycle: pending → success (action_id) or failed (credits refunded). Needs API key. Free. Track wireBuildRequest builds, pick up action_id on success.",
	inputSchema: z.object({}),
	contextSchema: toolContextSchema,
	execute: async (
		_input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ buildRequests: BuildRequestResult[] }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;
		try {
			const { body } = await anakinGet<{ build_requests?: ApiBuildRequest[] }>(
				"/wire/build-requests",
				undefined,
				key.apiKey,
			);
			const buildRequests = (body.build_requests ?? [])
				.filter(
					(br): br is ApiBuildRequest & { id: string } =>
						br != null && typeof br === "object" && typeof br.id === "string",
				)
				.map((br) => ({
					id: br.id,
					status: typeof br.status === "string" ? br.status : "pending",
					domain: typeof br.domain === "string" ? br.domain : undefined,
					creditsCharged:
						typeof br.credits_charged === "number"
							? br.credits_charged
							: undefined,
					actionId: typeof br.action_id === "string" ? br.action_id : undefined,
					error: typeof br.error === "string" ? br.error : undefined,
					createdAt:
						typeof br.created_at === "string" ? br.created_at : undefined,
					updatedAt:
						typeof br.updated_at === "string" ? br.updated_at : undefined,
				}));
			return { ok: true, buildRequests };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
