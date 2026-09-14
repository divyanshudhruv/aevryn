import { requireUser } from "@aevryn/auth";
import { WorkspaceService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceService = new WorkspaceService();

export async function GET(): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return Response.json(
			{ data: null, error: { code: "UNAUTHENTICATED", message: "Sign in first.", details: null }, meta: {} },
			{ status: 401, headers: { "cache-control": "no-store" } },
		);
	}

	const data = await workspaceService.getProfile(user.id);

	return Response.json(
		{ data, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
