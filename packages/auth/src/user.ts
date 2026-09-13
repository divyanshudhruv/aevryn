import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = {
	id: string;
	email?: string | null;
	name?: string | null;
	avatarUrl?: string | null;
};

export async function getCurrentUser(
	supabase: SupabaseClient,
): Promise<AuthUser | null> {
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return null;
	return {
		id: user.id,
		email: user.email,
		name: (user.user_metadata?.full_name as string | undefined) ?? null,
		avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
	};
}

export async function requireUser(supabase: SupabaseClient): Promise<AuthUser> {
	const user = await getCurrentUser(supabase);
	if (!user) throw new Error("Unauthenticated");
	return user;
}
