import { requireUser } from "@aevryn/auth";
import { memoryService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

export async function GET(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const url = new URL(request.url);
	const threadId = url.searchParams.get("threadId");
	if (!threadId) {
		return jsonError(400, "MISSING_THREAD", "threadId is required.");
	}

	try {
		const memories = await memoryService.list({
			userId: user.id,
			threadId,
		});
		return Response.json(
			{ data: { memories }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === "NO_MEM0_KEY") {
			return jsonError(
				404,
				"NO_MEM0_KEY",
				err instanceof Error ? err.message : "Mem0 key missing.",
			);
		}
		console.warn("[api/memories] mem0 list failed", err);
		return jsonError(502, "MEM0_ERROR", "Could not load memories.");
	}
}

export async function DELETE(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const url = new URL(request.url);
	const id = url.searchParams.get("id");
	if (!id) {
		return jsonError(400, "MISSING_ID", "id is required.");
	}

	try {
		await memoryService.delete({ userId: user.id, memoryId: id });
		return Response.json(
			{ data: { deleted: true }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === "NO_MEM0_KEY") {
			return jsonError(
				404,
				"NO_MEM0_KEY",
				err instanceof Error ? err.message : "Mem0 key missing.",
			);
		}
		console.warn("[api/memories] mem0 delete failed", err);
		return jsonError(502, "MEM0_ERROR", "Could not delete the memory.");
	}
}
