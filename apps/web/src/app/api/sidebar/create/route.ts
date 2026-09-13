import { requireUser } from "@aevryn/auth";
import { db, groups, threads } from "@aevryn/db";
import { and, eq } from "drizzle-orm";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * POST /api/sidebar — sidebar mutations.
 * Body: { kind: "group", workspaceId, name }
 *     | { kind: "thread", workspaceId, groupId?, title? }
 *     | { kind: "rename-thread" | "rename-group", id, name }
 *     | { kind: "delete-thread" | "delete-group", id }
 */
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
		const [group] = await db
			.insert(groups)
			.values({ workspaceId, userId: user.id, name: name.trim() })
			.returning({ id: groups.id, name: groups.name });
		return Response.json(
			{ data: group, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "thread") {
		if (!workspaceId) {
			return jsonError(400, "MISSING_WORKSPACE", "workspaceId is required.");
		}
		const [thread] = await db
			.insert(threads)
			.values({
				workspaceId,
				userId: user.id,
				groupId: groupId ?? null,
				title: title?.trim() || "New thread",
			})
			.returning({ id: threads.id, title: threads.title, groupId: threads.groupId });
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
			await db
				.update(threads)
				.set({ title: name.trim() })
				.where(and(eq(threads.id, id), eq(threads.userId, user.id)));
		} else {
			await db
				.update(groups)
				.set({ name: name.trim() })
				.where(and(eq(groups.id, id), eq(groups.userId, user.id)));
		}
		return Response.json(
			{ data: { id, name: name.trim() }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "delete-thread") {
		if (!id) return jsonError(400, "MISSING_ID", "id is required.");
		await db
			.update(threads)
			.set({ deletedAt: new Date() })
			.where(and(eq(threads.id, id), eq(threads.userId, user.id)));
		return Response.json(
			{ data: { id }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	if (kind === "delete-group") {
		if (!id) return jsonError(400, "MISSING_ID", "id is required.");
		await db
			.delete(groups)
			.where(and(eq(groups.id, id), eq(groups.userId, user.id)));
		return Response.json(
			{ data: { id }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	}

	return jsonError(400, "BAD_KIND", "Unknown kind.");
}
