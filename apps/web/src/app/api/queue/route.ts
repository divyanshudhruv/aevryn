import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import { MemberService, QueueService, ThreadService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const memberService = new MemberService();
const queueService = new QueueService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{
			status,
			headers: { "cache-control": "no-store" },
		},
	);
}

function jsonOk(data: unknown): Response {
	return Response.json(
		{ data, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

async function assertThreadAccess(
	user: { id: string },
	threadId: string,
): Promise<{ workspaceId: string } | Response> {
	const thread = await threadService.findById(threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.deletedAt) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	const members = await memberService.listByUser(user.id);
	const canAccess =
		thread.userId === user.id ||
		members.some((m) => m.workspaceId === thread.workspaceId);
	if (!canAccess) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
	}
	return { workspaceId: thread.workspaceId };
}

async function authUser(): Promise<{ id: string } | Response> {
	const supabase = await createServerSupabaseForNext();
	try {
		return await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
}

export async function GET(request: Request): Promise<Response> {
	const user = await authUser();
	if (user instanceof Response) {
		return user;
	}
	const url = new URL(request.url);
	const threadId = url.searchParams.get("threadId");
	if (!threadId) {
		return jsonError(400, "INVALID_PAYLOAD", "`threadId` is required.");
	}
	const access = await assertThreadAccess(user, threadId);
	if (access instanceof Response) {
		return access;
	}
	return jsonOk(await queueService.listQueued(threadId));
}

const enqueueSchema = z.object({
	threadId: z.string().min(1),
	text: z.string().min(1).max(20_000),
});

export async function POST(request: Request): Promise<Response> {
	const user = await authUser();
	if (user instanceof Response) {
		return user;
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = null;
	}
	const parsed = enqueueSchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "A non-empty `text` is required.");
	}
	const access = await assertThreadAccess(user, parsed.data.threadId);
	if (access instanceof Response) {
		return access;
	}
	const queued = await queueService.enqueue({
		threadId: parsed.data.threadId,
		userId: user.id,
		text: parsed.data.text,
	});
	return jsonOk({
		id: queued.id,
		queueOrder: queued.queueOrder,
	});
}