import { redirect } from "next/navigation";

import { requireUser } from "@aevryn/auth";
import { db, workspaces } from "@aevryn/db";
import { asc, eq } from "drizzle-orm";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * `/workspace` landing: resolve the user's default (first) workspace and
 * forward to it. The signup trigger creates a Personal workspace on first
 * sign-in, so this normally redirects immediately; a user without any
 * workspace goes to onboarding.
 */
export default async function WorkspaceIndexPage() {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		redirect("/login");
	}

	const rows = await db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.createdBy, user.id))
		.orderBy(asc(workspaces.createdAt))
		.limit(1);

	if (rows.length === 0) {
		// Self-heal: the signup trigger may have missed this user (created
		// before the glue SQL existed). Create their Personal workspace here
		// instead of bouncing to onboarding.
		const [created] = await db
			.insert(workspaces)
			.values({ name: "Personal", createdBy: user.id, isDefault: true })
			.returning({ id: workspaces.id });
		redirect(`/workspace/${created.id}`);
	}

	redirect(`/workspace/${rows[0].id}`);
}
