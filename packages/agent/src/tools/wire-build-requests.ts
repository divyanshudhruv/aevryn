import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinGet,
	mapAnakinError,
	requireKey,
	type ToolResult,
} from "./anakin-client";
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
		"List your Wire build requests and their lifecycle (pending → success with an action_id, or failed with credits refunded). Requires an API key. Free. Use it to track a build submitted with wireBuildRequest and pick up the action_id once it succeeds.",
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
						typeof br.credits_charged === "number" ? br.credits_charged : undefined,
					actionId: typeof br.action_id === "string" ? br.action_id : undefined,
					error: typeof br.error === "string" ? br.error : undefined,
					createdAt: typeof br.created_at === "string" ? br.created_at : undefined,
					updatedAt: typeof br.updated_at === "string" ? br.updated_at : undefined,
				}));
			return { ok: true, buildRequests };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});
