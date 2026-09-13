import { requireUser } from "@aevryn/auth";
import { db, userProfiles } from "@aevryn/db";
import { eq } from "drizzle-orm";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me — display name + avatar of the signed-in user. */
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

	const rows = await db
		.select({ name: userProfiles.name, pfp: userProfiles.pfp })
		.from(userProfiles)
		.where(eq(userProfiles.userId, user.id))
		.limit(1);

	return Response.json(
		{ data: { name: rows[0]?.name ?? null, pfp: rows[0]?.pfp ?? null }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
