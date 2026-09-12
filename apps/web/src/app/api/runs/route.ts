import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import { inngest, threadRunEvent } from "@aevryn/inngest";
import { QueueService, RunService, ThreadService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runsBodySchema = z.object({
	threadId: z.string().min(1),
	prompt: z.string().min(1).max(2000),
});

const runService = new RunService();
const threadService = new ThreadService();
const queueService = new QueueService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * Start a durable run for a thread. Powers the workspace "Run" button and
 * message-level re-runs that need the full background toolkit (schedules,
 * webhooks, sleeps). The live streaming path (`/api/chat`) keeps its own
 * flow; the durable path runs through Inngest.
 */
export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = null;
	}
	const parsed = runsBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "`threadId` and a non-empty `prompt` are required.");
	}
	const { threadId, prompt } = parsed.data;

	const thread = await threadService.findById(threadId);
	if (!thread || thread.deletedAt) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
	}
	if (await queueService.hasActiveRun(threadId)) {
		return jsonError(409, "RUN_ACTIVE", "A run is already in progress for this thread.");
	}

	const run = await runService.create({
		threadId,
		userId: user.id,
		trigger: "message",
		promptSnapshot: { prompt },
	});
	await inngest.send({
		name: threadRunEvent,
		data: { runId: run.id, threadId, prompt },
	});

	return Response.json(
		{
			data: { runId: run.id, threadId, status: run.status },
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}