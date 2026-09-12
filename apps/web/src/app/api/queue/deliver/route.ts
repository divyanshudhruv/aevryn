import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import { MemberService, QueueService, ThreadService } from "@aevryn/workflow";
import { inngest, queueDeliverEvent } from "@aevryn/inngest";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const memberService = new MemberService();
const queueService = new QueueService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

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
	const parsed = z
		.object({ threadId: z.string().min(1) })
		.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "`threadId` is required.");
	}
	const thread = await threadService.findById(parsed.data.threadId);
	if (!thread || thread.deletedAt) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	const members = await memberService.listByUser(user.id);
	const canAccess =
		thread.userId === user.id ||
		members.some((m) => m.workspaceId === thread.workspaceId);
	if (!canAccess) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
	}
	if (await queueService.hasActiveRun(parsed.data.threadId)) {
		return jsonError(409, "RUN_ACTIVE", "A run is still in progress.");
	}
	await inngest.send({
		name: queueDeliverEvent,
		data: { threadId: parsed.data.threadId },
	});
	return Response.json(
		{
			data: { dispatched: true },
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}