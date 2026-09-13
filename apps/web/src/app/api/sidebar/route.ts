import { requireUser } from "@aevryn/auth";
import { db, userProfiles } from "@aevryn/db";
import { eq } from "drizzle-orm";
import { WorkspaceService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workspaceService = new WorkspaceService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * GET /api/sidebar?workspaceId=… — everything the sidebar renders in one
 * read: the user's workspaces, plus groups and live-status threads for the
 * selected workspace. Omitting workspaceId selects the default (first) one.
 */
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

	const workspaces = await workspaceService.listForUser(user.id);
	if (workspaces.length === 0) {
		return jsonError(404, "NO_WORKSPACE", "No workspace exists yet.");
	}

	const workspace =
		workspaces.find((w) => w.id === requestedId) ?? workspaces[0];

	const [groups, threads, profileRows] = await Promise.all([
		workspaceService.listGroups(workspace.id),
		workspaceService.listThreads(workspace.id),
		db
			.select({ name: userProfiles.name, pfp: userProfiles.pfp })
			.from(userProfiles)
			.where(eq(userProfiles.userId, user.id))
			.limit(1),
	]);

	return Response.json(
		{
			data: {
				workspace,
				workspaces,
				groups,
				threads,
				userName: profileRows[0]?.name ?? null,
				userPfp: profileRows[0]?.pfp ?? null,
			},
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}
