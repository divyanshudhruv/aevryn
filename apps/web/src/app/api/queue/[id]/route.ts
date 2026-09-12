import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import { QueueService, ThreadService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const queueService = new QueueService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { id } = await ctx.params;
	const queued = await queueService.findById(id);
	if (!queued) {
		return jsonError(404, "NOT_QUEUED", "Queued message does not exist.");
	}
	const thread = await threadService.findById(queued.threadId);
	if (!thread || thread.deletedAt) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	const canAccess = thread.userId === user.id;
	if (!canAccess) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = null;
	}
	const parsed = z.object({ text: z.string().min(1).max(20_000) }).safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "A non-empty `text` is required.");
	}
	const updated = await queueService.updateContent(id, parsed.data.text);
	return Response.json(
		{ data: { id: updated?.id }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function DELETE(
	_request: Request,
	ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { id } = await ctx.params;
	const queued = await queueService.findById(id);
	if (!queued) {
		return jsonError(404, "NOT_QUEUED", "Queued message does not exist.");
	}
	const thread = await threadService.findById(queued.threadId);
	if (!thread || thread.deletedAt) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
	}
	await queueService.remove(id);
	return Response.json(
		{ data: { removed: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}