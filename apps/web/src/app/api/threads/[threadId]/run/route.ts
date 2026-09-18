import { requireUser } from "@aevryn/auth";
import { ChatService } from "@aevryn/workflow";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Workflow runs can dispatch many steps; keep the request alive past the
// default 10s cap while the run-progress stream is open.
export const maxDuration = 300;

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

	const chatService = new ChatService();
	let result: Awaited<ReturnType<typeof chatService.runControl>>;
	try {
		result = await chatService.runControl({
			threadId,
			userId: user.id,
			action: body.action === "stop" ? "stop" : "run",
		});
	} catch (err) {
		if (
			err instanceof Error &&
			(err as { code?: string }).code === "THREAD_NOT_FOUND"
		) {
			return jsonError(404, "NOT_FOUND", "Thread not found.");
		}
		throw err;
	}

	if (result.status === "no-bound-workflow") {
		return jsonError(
			409,
			"NO_BOUND_WORKFLOW",
			"Bind a workflow to this thread before running it.",
		);
	}

	if (result.status === "already-running") {
		return jsonError(409, "ALREADY_RUNNING", "Thread is already running.");
	}

	return Response.json(
		{
			data: result.status === "stopped" ? { status: "idle" } : { ok: true },
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}
