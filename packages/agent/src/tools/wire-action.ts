import { tool } from "ai";
import { z } from "zod";

import { toolContextSchema, type ToolContext } from "./context";
import {
	anakinGet,
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

export interface WireFile {
	name: string;
	contentType?: string;
	sizeBytes?: number;
}

export interface WireRunResult {
	jobId?: string;
	status: string;
	data?: Record<string, unknown> | null;
	files?: WireFile[];
	creditsUsed?: number;
	executionMs?: number;
	error?: { code?: string; message?: string };
}

interface WireJobBody extends Record<string, unknown> {
	status?: string;
	job_id?: string;
	data?: unknown;
	files?: unknown;
	credits_used?: number;
	execution_ms?: number;
	error?: unknown;
	retry_after_ms?: number;
}

function mapFiles(raw: unknown): WireFile[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const files = raw
		.filter(
			(f): f is Record<string, unknown> =>
				f != null && typeof f === "object" && typeof (f as Record<string, unknown>).name === "string",
		)
		.map((f) => ({
			name: f.name as string,
			contentType: typeof f.content_type === "string" ? f.content_type : undefined,
			sizeBytes: typeof f.size_bytes === "number" ? f.size_bytes : undefined,
		}));
	return files.length > 0 ? files : undefined;
}

function isTerminal(status: string): boolean {
	return status === "completed" || status === "failed";
}

function mapJobBody(body: WireJobBody, jobId: string): WireRunResult {
	return {
		jobId: jobId,
		status: body.status ?? "failed",
		data:
			body.data != null && typeof body.data === "object" && !Array.isArray(body.data)
				? (body.data as Record<string, unknown>)
				: null,
		files: mapFiles(body.files),
		creditsUsed: typeof body.credits_used === "number" ? body.credits_used : undefined,
		executionMs: typeof body.execution_ms === "number" ? body.execution_ms : undefined,
		error:
			body.error != null && typeof body.error === "object"
				? (body.error as { code?: string; message?: string })
				: undefined,
	};
}

export const wireActionTool = tool({
	description:
		"Execute a Wire action from wireDiscover. Read-only: keyless, free-tier. Write actions: need API key + user approval. Params exactly per action schema. File results: files manifest, download with wireDownload.",
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

			// Keyless read-only path: the sync run returns the result inline.
			if (!input.credentialId) {
				const { status, body: runBody } = await anakinPost<WireJobBody>(
					"/wire-run",
					body,
					context.anakinKey, // sent if present; works without
					120_000,
				);
				if (status === 200) {
					const inline = runBody as unknown as WireRunResult & {
						job_id?: string;
						files?: unknown;
					};
					return {
						ok: true,
						result: {
							status: inline.status,
							data:
								inline.data != null &&
								typeof inline.data === "object" &&
								!Array.isArray(inline.data)
									? (inline.data as Record<string, unknown>)
									: null,
							files: mapFiles(inline.files),
							creditsUsed: inline.creditsUsed,
							executionMs: inline.executionMs,
							error: inline.error,
						},
					};
				}
				// 401/402/etc from the sync endpoint fall through to the async path
				// which produces typed, actionable errors.
			}

			// Keyed async durable path (writes, connected runs). Raw because the
			// SDK's wire() drops credential_id and the files[] manifest.
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

			const { status: submitStatus, body: submitted } = await anakinPost<{
				job_id?: string;
				status?: string;
			}>("/wire/task", body, context.anakinKey, 30_000);
			const jobId =
				typeof submitted.job_id === "string" ? submitted.job_id : undefined;
			if (submitStatus !== 202 || !jobId) {
				throw Object.assign(
					new Error(
						typeof (submitted as Record<string, unknown>).message === "string"
							? ((submitted as Record<string, unknown>).message as string)
							: `Wire task submit failed (${submitStatus})`,
					),
					{ statusCode: submitStatus, body: submitted },
				);
			}

			const jobBody = await pollWireJob(jobId, context.anakinKey);
			return { ok: true, result: mapJobBody(jobBody, jobId) };
		} catch (err) {
			return mapAnakinError(err);
		}
	},
});

async function pollWireJob(jobId: string, apiKey: string): Promise<WireJobBody> {
	const maxAttempts = 60;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const { body } = await anakinGet<WireJobBody>(
			`/wire/jobs/${jobId}`,
			undefined,
			apiKey,
		);
		if (isTerminal(body.status ?? "")) return body;
		const retryAfterMs =
			typeof body.retry_after_ms === "number" && body.retry_after_ms > 0
				? body.retry_after_ms
				: 2_500;
		await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
	}
	throw new Error(`Wire job ${jobId} did not settle within the poll window.`);
}

// Re-export for the agent-level toolApproval wiring in Task 6.
export type { DiscoveredAction };
