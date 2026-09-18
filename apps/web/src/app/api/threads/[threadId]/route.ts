import { requireUser } from "@aevryn/auth";
import { ChatService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	groupId: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ threadId: string }> };

export async function PATCH(
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

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
	}
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(
			400,
			"VALIDATION_ERROR",
			parsed.error.issues[0]?.message ?? "Invalid input.",
		);
	}

	const chatService = new ChatService();
	const row = await chatService.updateThread({
		threadId,
		userId: user.id,
		patch: parsed.data,
	});
	if (!row) {
		return jsonError(404, "NOT_FOUND", "Thread not found.");
	}
	return Response.json(
		{ data: row, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
