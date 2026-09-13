import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import {
	ApprovalService,
	RunTransition,
	ThreadService,
} from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const approvalService = new ApprovalService();
const runTransition = new RunTransition();
const threadService = new ThreadService();

const resolveBodySchema = z.object({
	decision: z.enum(["approved", "denied"]),
});

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * Approval resolution — validates the decision, updates the approval request,
 * and resumes the SAME paused run through the shared transition helper. The
 * caller then re-fires thread/run; the existing runner logic continues the run.
 */
export async function POST(
	request: Request,
	ctx: { params: Promise<{ approvalId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { approvalId } = await ctx.params;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = null;
	}
	const parsed = resolveBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "`decision` must be approved or denied.");
	}

	const approval = await approvalService.findById(approvalId);
	if (!approval) {
		return jsonError(404, "APPROVAL_NOT_FOUND", "Approval does not exist.");
	}
	if (approval.status !== "pending") {
		return jsonError(409, "ALREADY_RESOLVED", "This approval was already resolved.");
	}
	if (approval.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this approval.");
	}

	const thread = approval.threadId
		? await threadService.findById(approval.threadId)
		: undefined;
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}

	await approvalService.resolve(approvalId, parsed.data.decision);

	if (parsed.data.decision === "approved") {
		await runTransition.resume(approval.runId);
	} else {
		// Denied: the paused run cannot proceed with the blocked tool; fail it.
		await runTransition.fail(approval.runId, `Approval denied for ${approval.toolName}`);
	}

	await threadService.insertSystemMessage(
		thread.id,
		user.id,
		parsed.data.decision === "approved"
			? `Approved: ${approval.toolName}. Run resumed.`
			: `Denied: ${approval.toolName}. Run stopped.`,
	);

	return Response.json(
		{
			data: { approvalId, decision: parsed.data.decision, runId: approval.runId },
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}
