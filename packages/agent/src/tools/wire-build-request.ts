import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	requireKey,
	anakinPost,
	type ToolResult,
} from "./anakin-client";

const inputSchema = z.object({
	siteUrl: z.string().url().describe("The site that has no Wire action yet."),
	goal: z
		.string()
		.min(1)
		.max(2_000)
		.describe("What the new action should do or extract — be specific; Anakin's builder synthesizes the scraper from this."),
	visibility: z
		.enum(["private", "public"])
		.optional()
		.describe("Private (default) = only your account sees the action."),
	force: z
		.boolean()
		.optional()
		.describe("Build even if similar actions exist for the domain (default false → 409 ACTION_EXISTS)."),
});

export interface BuildRequestResult {
	id: string;
	status: string;
	domain?: string;
	creditsCharged?: number;
	actionId?: string;
	error?: string;
}

export const wireBuildRequestTool = tool({
	description:
		"Request a NEW Wire action for a site that isn't in the catalog yet. Requires an API key and user approval (~25 credits, refunded if the build fails). The build is asynchronous — report the request id and tell the user the action will appear in the catalog when ready.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ buildRequest: BuildRequestResult }>> => {
		const key = requireKey(context.anakinKey);
		if (!key.ok) return key;

		try {
			const body: Record<string, unknown> = {
				website_url: input.siteUrl,
				goal: input.goal,
			};
			if (input.visibility) body.visibility = input.visibility;
			if (input.force != null) body.force = input.force;

			const { body: response } = await anakinPost<{
				status: string;
				build_request?: Record<string, unknown>;
			}>("/wire/build-request", body, key.apiKey, 30_000);

			const br = (response.build_request ?? {}) as Record<string, unknown>;
			return {
				ok: true,
				buildRequest: {
					id: typeof br.id === "string" ? br.id : "unknown",
					status: typeof br.status === "string" ? br.status : "pending",
					domain: typeof br.domain === "string" ? br.domain : undefined,
					creditsCharged:
						typeof br.credits_charged === "number" ? br.credits_charged : undefined,
					actionId: typeof br.action_id === "string" ? br.action_id : undefined,
					error: typeof br.error === "string" ? br.error : undefined,
				},
			};
		} catch (err) {
			return {
				ok: false,
				error: {
					code: "BUILD_REQUEST_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			};
		}
	},
});
