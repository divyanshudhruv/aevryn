import { NextResponse } from "next/server";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

/**
 * OAuth callback — exchanges the provider code for a session (writes auth
 * cookies) and routes the user into the app.
 */
export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get("code");
	const next = searchParams.get("next") ?? "/workspace";

	if (code) {
		const supabase = await createServerSupabaseForNext();
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			return NextResponse.redirect(`${origin}${next}`);
		}
	}

	return NextResponse.redirect(`${origin}/login?error=unable-to-sign-in`);
}