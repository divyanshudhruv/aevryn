import { requireUser } from "@aevryn/auth";
import { WorkspaceService } from "@aevryn/workflow";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceService = new WorkspaceService();

export async function GET(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const url = new URL(request.url);
	const requestedId = url.searchParams.get("workspaceId");
	const data = await workspaceService.getSidebarData(user.id, requestedId);
	if (!data.workspace) {
		return jsonError(404, "NO_WORKSPACE", "No workspace exists yet.");
	}

	return Response.json(
		{ data, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
