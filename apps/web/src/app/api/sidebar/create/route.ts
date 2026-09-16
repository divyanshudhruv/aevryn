import { requireUser } from "@aevryn/auth";
import { WorkspaceService } from "@aevryn/workflow";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceService = new WorkspaceService();

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
		return jsonError(400, "BAD_JSON", "Invalid JSON body.");
	}
	const { kind, workspaceId, groupId, name, title, id } = body as Record<
		string,
		string | undefined
	>;

	if (kind === "group") {
		if (!workspaceId) {
			return jsonError(400, "MISSING_WORKSPACE", "workspaceId is required.");
		}
		if (!name || name.trim() === "") {
			return jsonError(400, "MISSING_NAME", "Group name is required.");
		}
		const group = await workspaceService.createGroup(workspaceId, user.id, name);
		return Response.json(
			{ data: group, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "thread") {
		if (!workspaceId) {
			return jsonError(400, "MISSING_WORKSPACE", "workspaceId is required.");
		}
		const thread = await workspaceService.createThread(workspaceId, user.id, groupId ?? null, title ?? "");
		return Response.json(
			{ data: thread, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "rename-thread" || kind === "rename-group") {
		if (!id || !name || name.trim() === "") {
			return jsonError(400, "MISSING_FIELDS", "id and name are required.");
		}
		if (kind === "rename-thread") {
			await workspaceService.renameThread(id, user.id, name);
		} else {
			await workspaceService.renameGroup(id, user.id, name);
		}
		return Response.json(
			{ data: { id, name: name.trim() }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "delete-thread") {
		if (!id) return jsonError(400, "MISSING_ID", "id is required.");
		await workspaceService.deleteThread(id, user.id);
		return Response.json(
			{ data: { id }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "delete-group") {
		if (!id) return jsonError(400, "MISSING_ID", "id is required.");
		await workspaceService.deleteGroup(id, user.id);
		return Response.json(
			{ data: { id }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	return jsonError(400, "BAD_KIND", "Unknown kind.");
}
