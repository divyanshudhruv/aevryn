import { requireUser } from "@aevryn/auth";
import { db, planSteps, threads } from "@aevryn/db";
import { and, eq, inArray } from "drizzle-orm";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

type RouteContext = { params: Promise<{ threadId: string }> };

/** Marks a thread as wanting to run (or stop) its bound workflow. */
export async function POST(
	request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { threadId } = await params;
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	let body: { action?: string } = {};
	try {
		body = (await request.json()) as { action?: string };
	} catch {
		// Empty body defaults to "run".
	}

	const [thread] = await db
		.select({ id: threads.id, boundWorkflowId: threads.boundWorkflowId })
		.from(threads)
		.where(and(eq(threads.id, threadId), eq(threads.userId, user.id)));
	if (!thread) {
		return jsonError(404, "NOT_FOUND", "Thread not found.");
	}

	if (body.action === "stop") {
		await db
			.update(threads)
			.set({ status: "idle" })
			.where(eq(threads.id, threadId));
		// Unwind the bound workflow's in-flight steps too — otherwise the
		// footer PlanStepsCard and the agent's step slider stay stuck on a
		// mid-run state after the stop.
		if (thread.boundWorkflowId) {
			await db
				.update(planSteps)
				.set({ status: "idle" })
				.where(
					and(
						eq(planSteps.workflowId, thread.boundWorkflowId),
						inArray(planSteps.status, [
							"running",
							"retrying",
							"awaiting_approval",
						]),
					),
				);
		}
		return Response.json(
			{ data: { status: "idle" }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (!thread.boundWorkflowId) {
		return jsonError(
			409,
			"NO_BOUND_WORKFLOW",
			"Bind a workflow to this thread before running it.",
		);
	}

	return Response.json(
		{ data: { ok: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
