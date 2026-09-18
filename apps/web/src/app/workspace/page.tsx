import { requireUser } from "@aevryn/auth";
import { WorkspaceService } from "@aevryn/workflow";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WorkspaceIndexPage() {
	const supabase = await createServerSupabaseForNext();
	const user = await requireUser(supabase);

	const workspaceService = new WorkspaceService();
	const workspaceId = await workspaceService.ensureDefaultWorkspace(user.id);

	redirect(`/workspace/${workspaceId}` as Route);
}
