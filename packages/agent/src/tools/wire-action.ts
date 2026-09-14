import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinClient,
	anakinPost,
	mapAnakinError,
	type ToolResult,
} from "./anakin-client";
import type { DiscoveredAction } from "./wire-discover";

const inputSchema = z.object({
	actionId: z.string().min(1).describe("action_id from wireDiscover."),
	params: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Parameters matching the action's schema from wireDiscover."),
	credentialId: z
		.string()
		.optional()
		.describe("Credential id for auth-required actions (from the Wire dashboard)."),
});

export interface WireRunResult {
	jobId?: string;
	status: string;
	data?: Record<string, unknown>;
	creditsUsed?: number;
	executionMs?: number;
	error?: { code?: string; message?: string };
}

export const wireActionTool = tool({
	description:
		"Execute a Wire action found via wireDiscover on a supported site. Read-only actions run keyless and free-tier; write actions need an API key AND user approval. Pass params exactly as the action's schema requires.",
	inputSchema,
	contextSchema: toolContextSchema,
	execute: async (
		input,
		{ context }: { context: ToolContext },
	): Promise<ToolResult<{ result: WireRunResult }>> => {
		try {
			const body: Record<string, unknown> = {
				action_id: input.actionId,
				params: input.params ?? {},
			};
			if (input.credentialId) body.credential_id = input.credentialId;

			// Read-only first attempt: sync keyless Zero-Touch run.
			if (!input.credentialId) {
				const { status, body: runBody } = await anakinPost<WireRunResult & { job_id?: string }>(
					"/wire-run",
					body,
					context.anakinKey, // sent if present; works without
					120_000,
				);
				if (status === 200) {
					return {
						ok: true,
						result: {
							status: runBody.status,
							data: runBody.data,
							creditsUsed: runBody.creditsUsed,
							executionMs: runBody.executionMs,
							error: runBody.error,
						},
					};
				}
				// 401/402/etc from the sync endpoint fall through to the async path
				// which produces typed, actionable errors.
			}

			// Keyed async durable path (writes, connected runs).
			if (!context.anakinKey) {
				return {
					ok: false,
					error: {
						code: "ANAKIN_KEY_REQUIRED",
						message:
							"This Wire action needs your Anakin API key (Settings → BYOK) — write and account-connected actions always do.",
					},
				};
			}

			const client = anakinClient(context.anakinKey);
			const result = await client.wire(input.actionId, input.params ?? {}, {
				pollTimeoutMs: 5 * 60_000,
			});
			return {
				ok: true,
				result: {
					jobId: result.jobId,
					status: result.status,
					data: result.data,
					creditsUsed: result.creditsUsed,
					executionMs: result.executionMs,
					error: result.error,
				},
			};
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});

// Re-export for the agent-level toolApproval wiring in Task 6.
export type { DiscoveredAction };
