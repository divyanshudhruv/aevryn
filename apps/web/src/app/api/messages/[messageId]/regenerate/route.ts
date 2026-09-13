import { requireUser } from "@aevryn/auth";
import { inngest, threadRunEvent } from "@aevryn/inngest";
import {
	MessageService,
	QueueService,
	RunService,
	RunTransition,
	ThreadService,
} from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const messageService = new MessageService();
const runService = new RunService();
const queueService = new QueueService();
const runTransition = new RunTransition();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * Message-level regenerate — thin re-fire. Resets the assistant message to
 * streaming, creates a rerun run, and hands off to the same Inngest agent
 * executor used by /api/chat. No agent logic lives here.
 */
export async function POST(
	_request: Request,
	ctx: { params: Promise<{ messageId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { messageId } = await ctx.params;

	const message = await queueService.findById(messageId);
	if (!message) {
		return jsonError(404, "MESSAGE_NOT_FOUND", "Message does not exist.");
	}
	if (message.role !== "assistant") {
		return jsonError(400, "NOT_ASSISTANT", "Only assistant messages can be regenerated.");
	}
	const thread = await threadService.findById(message.threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this message.");
	}
	if (await queueService.hasActiveRun(thread.id)) {
		return jsonError(409, "RUN_ACTIVE", "Stop the running item before regenerating.");
	}

	// Reconstruct the original user prompt from the prior context.
	const messages = await threadService.listMessagesByThread(thread.id);
	const index = messages.findIndex((row) => row.id === messageId);
	const prior = messages.slice(0, index);
	const lastUser = [...prior].reverse().find((row) => row.role === "user");
	const prompt = extractText(lastUser?.content);
	if (!prompt) {
		return jsonError(400, "NOTHING_TO_REGENERATE", "No prior context to regenerate from.");
	}

	const run = await runService.create({
		threadId: thread.id,
		userId: user.id,
		trigger: "rerun",
		rerunOf: message.runId ?? undefined,
		promptSnapshot: prompt.slice(0, 2000),
	});
	await runTransition.start(run.id);
	await messageService.startAssistant({
		threadId: thread.id,
		userId: user.id,
		runId: run.id,
	});

	await inngest.send({
		name: threadRunEvent,
		data: { runId: run.id, threadId: thread.id, prompt: prompt.slice(0, 2000) },
	});

	return Response.json(
		{
			data: { runId: run.id, messageId, threadId: thread.id },
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}

function extractText(content: unknown): string | null {
	if (typeof content === "string") return content || null;
	const parts = (content as { parts?: Array<{ type?: string; text?: string }> } | null)
		?.parts;
	if (Array.isArray(parts)) {
		return (
			parts
				.filter((p) => p.type === "text" && typeof p.text === "string")
				.map((p) => p.text)
				.join(" ") || null
		);
	}
	return null;
}
