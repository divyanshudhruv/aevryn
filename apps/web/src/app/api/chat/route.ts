import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import { inngest, threadRunEvent } from "@aevryn/inngest";
import {
	MessageService,
	QueueService,
	RunService,
	RunTransition,
	ThreadService,
	hooks,
} from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const messageService = new MessageService();
const runService = new RunService();
const queueService = new QueueService();
const runTransition = new RunTransition();

const chatBodySchema = z.object({
	threadId: z.string().min(1).optional(),
	workspaceId: z.string().min(1).optional(),
	message: z.string().min(1).max(20_000),
});

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{
			status,
			headers: { "cache-control": "no-store" },
		},
	);
}

/**
 * Submission/orchestration path — deliberately thin. It authenticates,
 * persists the user message, ensures thread + run exist, applies queue
 * backpressure when the thread is busy, and hands durable work to the
 * Inngest thread-run agent executor. It never runs the agent itself.
 */
export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in to use chat.");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = null;
	}
	const parsed = chatBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "A non-empty `message` is required.");
	}
	const { message } = parsed.data;

	let threadId = parsed.data.threadId;
	let workspaceId = parsed.data.workspaceId;

	if (threadId) {
		const thread = await threadService.findById(threadId);
		if (!thread) {
			return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
		}
		if (thread.userId !== user.id) {
			return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
		}
		workspaceId = thread.workspaceId;
	}

	if (!workspaceId) {
		return jsonError(400, "NO_WORKSPACE", "Create a workspace first.");
	}

	if (!threadId) {
		const thread = await threadService.create({
			workspaceId,
			userId: user.id,
			title: "",
		});
		threadId = thread.id;
	}
	const thread = await threadService.findById(threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}

	// Backpressure: thread busy → queue the message instead of starting a run.
	if (await hooks.isThreadBusy(threadId)) {
		const queued = await queueService.enqueue({
			threadId,
			userId: user.id,
			text: message,
		});
		return Response.json(
			{
				data: { queued: true, threadId, messageId: queued.id, runId: null },
				error: null,
				meta: {},
			},
			{ headers: { "cache-control": "no-store" } },
		);
	}

	// Persist the user message and touch thread state.
	await messageService.saveUser({
		threadId,
		userId: user.id,
		text: message,
	});
	if (!thread.title) {
		await threadService.autoTitle(threadId, message);
	}
	await threadService.touchLastMessage(threadId);

	// Create the run and hand off to the durable agent executor.
	const run = await runService.create({
		threadId,
		userId: user.id,
		trigger: "message",
		promptSnapshot: message.slice(0, 2000),
	});
	await runTransition.start(run.id);

	await inngest.send({
		name: threadRunEvent,
		data: { runId: run.id, threadId, prompt: message.slice(0, 2000) },
	});

	return Response.json(
		{
			data: { queued: false, threadId, messageId: null, runId: run.id },
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}
