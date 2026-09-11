import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentUser(
	supabase: SupabaseClient,
): Promise<{ id: string; email?: string | null } | null> {
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return null;
	return { id: user.id, email: user.email };
}

export async function requireUser(supabase: SupabaseClient): Promise<{
	id: string;
	email?: string | null;
}> {
	const user = await getCurrentUser(supabase);
	if (!user) throw new Error("Unauthenticated");
	return user;
}