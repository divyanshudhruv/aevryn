import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileRow = {
	id: string;
	userId: string;
	onboarded: boolean;
	preAnswers: Record<string, never> | null;
};

/**
 * Returns the current user's profile row, creating it on demand when the
 * signup trigger somehow missed it (create-on-demand per final-docs).
 */
export async function getProfileOrCreate(
	supabase: SupabaseClient,
	userId: string,
): Promise<ProfileRow | null> {
	const { data } = await supabase
		.from("user_profiles")
		.select("id,user_id,onboarded,pre_answers")
		.eq("user_id", userId)
		.maybeSingle();

	if (data) {
		return {
			id: data.id,
			userId: data.user_id,
			onboarded: data.onboarded,
			preAnswers: data.pre_answers,
		};
	}

	const { data: inserted } = await supabase
		.from("user_profiles")
		.insert({ user_id: userId })
		.select("id,user_id,onboarded,pre_answers")
		.single();

	if (!inserted) return null;

	return {
		id: inserted.id,
		userId: inserted.user_id,
		onboarded: inserted.onboarded,
		preAnswers: inserted.pre_answers,
	};
}