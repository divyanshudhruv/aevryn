import { redirect } from "next/navigation";

import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { requireUser } from "@aevryn/auth";

export default async function WorkspaceRootPage() {
	const supabase = await createServerSupabaseForNext();
	const user = await requireUser(supabase);

	const { data } = await supabase
		.from("workspaces")
		.select("id")
		.eq("is_default", true)
		.limit(1)
		.maybeSingle();

	if (!data) {
		redirect("/onboarding");
	}

	redirect(`/workspace/${data.id}`);
}