import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileRow = {
	id: string;
	userId: string;
	onboarded: boolean;
	preAnswers: Record<string, never> | null;
};

export type ProfileIdentityInput = {
	name?: string | null;
	email?: string | null;
	pfp?: string | null;
};

/**
 * Persists the auth provider's identity (name, email, avatar url) onto the
 * user's profile row. Upsert keyed on user_id so it also creates the row when
 * the signup trigger somehow missed it. Called right after login (callback)
 * and at onboarding — never overwrites a name the user edited themselves,
 * because we only fire with provider values when they exist.
 */
export async function syncProfileFromAuth(
	supabase: SupabaseClient,
	userId: string,
	identity: ProfileIdentityInput,
): Promise<void> {
	const values = {
		name: identity.name ?? "",
		email: identity.email ?? "",
		pfp: identity.pfp ?? "",
	};

	const { error } = await supabase.from("user_profiles").upsert(
		{
			// `id` has no DB default (trigger normally sets prf_<uuid>), so
			// supply it for the create-on-demand insert path.
			id: `prf_${crypto.randomUUID().replace(/-/g, "")}`,
			user_id: userId,
			...values,
		},
		{ onConflict: "user_id" },
	);

	if (error) {
		// Non-fatal: login must not break because profile sync failed.
		console.error("syncProfileFromAuth failed:", error.message);
	}
}

/**
 * Extracts the Google identity (full_name, email, avatar_url) from a Supabase
 * user's metadata, tolerating both `user_metadata` and linked-identity shapes.
 */
export function identityFromAuthUser(user: {
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
}): ProfileIdentityInput {
	const meta = user.user_metadata ?? {};
	return {
		name:
			(typeof meta.full_name === "string" && meta.full_name) ||
			(typeof meta.name === "string" && meta.name) ||
			null,
		email: user.email ?? null,
		pfp:
			(typeof meta.avatar_url === "string" && meta.avatar_url) ||
			(typeof meta.picture === "string" && meta.picture) ||
			null,
	};
}

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