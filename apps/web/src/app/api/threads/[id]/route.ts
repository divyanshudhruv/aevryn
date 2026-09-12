import { requireUser } from "@aevryn/auth";
import { MemberService, ThreadService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const memberService = new MemberService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
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
	const thread = await threadService.findById(id);
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
	await threadService.softDelete(id);
	return Response.json(
		{ data: { id }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}