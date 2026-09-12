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

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * Stop an in-flight run. Covers `running`/`pending` (a queued thread/run event),
 * `sleeping`, `waiting`, and `awaiting_approval`. The run is flipped to
 * `cancelled` so the thread-runner's gate treats any late event as a no-op;
 * pending approval requests for it are denied; a system chat message is
 * appended and the queue drain is re-armed so queued messages can proceed.
 */
export async function POST(
	_request: Request,
	ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { runId } = await ctx.params;

	const run = await runService.findById(runId);
	if (!run) {
		return jsonError(404, "RUN_NOT_FOUND", "Run does not exist.");
	}
	const thread = await threadService.findById(run.threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this run.");
	}
	if (TERMINAL.has(run.status)) {
		return jsonError(409, "RUN_ALREADY_FINISHED", "This run has already finished.");
	}

	await runService.setStatus(runId, "cancelled");
	await runService.createActivity({
		runId: runId,
		type: "system",
		status: "complete",
		stepLabel: "stop",
		title: "Run stopped",
		detail: { requestedBy: user.id },
	});

	const pending = await approvalService.listPendingForRun(runId);
	for (const approval of pending) {
		await approvalService.resolve(approval.id, "denied");
	}

	await threadService.insertSystemMessage(
		thread.id,
		thread.userId,
		`Run stopped${pending.length > 0 ? ` (${pending.length} pending approval request${pending.length === 1 ? "" : "s"} denied)` : ""}.`,
	);

	await inngest.send({ name: queueDeliverEvent, data: { threadId: thread.id } });

	return Response.json(
		{
			data: {
				runId,
				threadId: thread.id,
				status: "cancelled",
				approvalsDenied: pending.length,
			},
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}