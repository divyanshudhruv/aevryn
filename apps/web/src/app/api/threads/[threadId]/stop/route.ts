import { requireUser } from "@aevryn/auth";
import { inngest, queueDeliverEvent } from "@aevryn/inngest";
import {
	ApprovalService,
	RunService,
	ThreadService,
} from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runService = new RunService();
const threadService = new ThreadService();
const approvalService = new ApprovalService();

const TERMINAL = new Set(["completed", "failed"]);

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * Stop the thread's active run (convenience over POST /api/runs/[runId]/stop):
 * resolves the latest non-terminal run, flips it to `failed`, denies its
 * pending approval requests, appends a system chat message, and re-arms the
 * queue drain so queued messages can proceed.
 */
export async function POST(
	_request: Request,
	ctx: { params: Promise<{ threadId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { threadId } = await ctx.params;

	const thread = await threadService.findById(threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
	}

	const runs = await runService.listByThread(threadId, 1);
	const run = runs[0];
	if (!run || TERMINAL.has(run.status)) {
		return jsonError(409, "NO_ACTIVE_RUN", "This thread has no active run.");
	}

	await runService.setStatus(run.id, "failed");
	await runService.createActivity({
		runId: run.id,
		type: "system",
		status: "completed",
		stepLabel: "stop",
		title: "Run stopped",
		detail: { requestedBy: user.id },
	});

	const approvalRequests = await approvalService.listPendingForRun(run.id);
	for (const approval of approvalRequests) {
		await approvalService.resolve(approval.id, "denied");
	}

	await threadService.insertSystemMessage(
		thread.id,
		thread.userId,
		`Run stopped${approvalRequests.length > 0 ? ` (${approvalRequests.length} pending approval request${approvalRequests.length === 1 ? "" : "s"} denied)` : ""}.`,
	);

	await inngest.send({ name: queueDeliverEvent, data: { threadId: thread.id } });

	return Response.json(
		{
			data: {
				runId: run.id,
				threadId: thread.id,
				status: "failed",
				approvalsDenied: approvalRequests.length,
			},
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}
