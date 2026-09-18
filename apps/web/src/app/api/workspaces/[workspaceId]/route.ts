import { requireUser } from "@aevryn/auth";
import { WorkspaceService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceService = new WorkspaceService();

const patchSchema = z.object({
	name: z.string().min(1).max(120).optional(),
	isDefault: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function PATCH(
	request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { workspaceId } = await params;
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
	if (Object.keys(parsed.data).length === 0) {
		return jsonError(400, "VALIDATION_ERROR", "Nothing to update.");
	}

	const row = await workspaceService.updateWorkspace({
		workspaceId,
		userId: user.id,
		patch: parsed.data,
	});
	if (!row) {
		return jsonError(404, "NOT_FOUND", "Workspace not found.");
	}
	return Response.json(
		{ data: { workspace: row }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function DELETE(
	_request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { workspaceId } = await params;
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const result = await workspaceService.deleteWorkspace({
		workspaceId,
		userId: user.id,
	});
	if (!result.deleted) {
		if (result.reason === "LAST_WORKSPACE") {
			return jsonError(
				409,
				"LAST_WORKSPACE",
				"You need at least one workspace.",
			);
		}
		return jsonError(404, "NOT_FOUND", "Workspace not found.");
	}
	return Response.json(
		{ data: { deleted: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
