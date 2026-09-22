import { db, userProfiles } from "@aevryn/db";
import { NextResponse } from "next/server";
import { identityFromAuthUser } from "@/lib/profile";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get("code");

	const next = "/workspace";

	if (code) {
		const supabase = await createServerSupabaseForNext();
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			const {
				data: { user },
			} = await supabase.auth.getUser();

			if (user) {
				const identity = identityFromAuthUser(user);
				await db
					.insert(userProfiles)
					.values({
						userId: user.id,
						name: identity.name ?? "",
						email: identity.email ?? "",
						avatarUrl: identity.avatarUrl ?? "",
					})
					.onConflictDoUpdate({
						target: userProfiles.userId,
						set: {
							name: identity.name ?? "",
							email: identity.email ?? "",
							avatarUrl: identity.avatarUrl ?? "",
						},
					});
			}

			return NextResponse.redirect(`${origin}${next}`);
		}
	}

	return NextResponse.redirect(`${origin}/signup?error=unable-to-sign-in`);
}
