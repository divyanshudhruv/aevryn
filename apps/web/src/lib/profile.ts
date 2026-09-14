export type ProfileIdentityInput = {
	name?: string | null;
	email?: string | null;
	avatarUrl?: string | null;
};

export function identityFromAuthUser(user: {
	email?: string | null;
	user_metadata?: Record<string, unknown> | null;
	identities?: Array<{
		identity_data?: Record<string, unknown> | null;
	}> | null;
}): ProfileIdentityInput {
	const meta = user.user_metadata ?? {};
	const identityData = user.identities?.[0]?.identity_data ?? {};
	return {
		name:
			(typeof meta.full_name === "string" && meta.full_name) ||
			(typeof meta.name === "string" && meta.name) ||
			(typeof identityData.full_name === "string" && identityData.full_name) ||
			(typeof identityData.name === "string" && identityData.name) ||
			null,
		email: user.email ?? null,
		avatarUrl:
			(typeof meta.avatar_url === "string" && meta.avatar_url) ||
			(typeof meta.picture === "string" && meta.picture) ||
			(typeof identityData.avatar_url === "string" && identityData.avatar_url) ||
			(typeof identityData.picture === "string" && identityData.picture) ||
			null,
	};
}