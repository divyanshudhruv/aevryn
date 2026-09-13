import { NextResponse } from "next/server";

import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { identityFromAuthUser, syncProfileFromAuth } from "@/lib/profile";

/**
 * OAuth callback — exchanges the provider code for a session (writes auth
 * cookies) and routes the user into the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Always land on /workspace. Deliberately ignore any `next` param: it may
  // carry a stale URL (e.g. a deleted workspace) captured by the proxy
  // before sign-in, and honoring it would redirect into a dead route.
  const next = "/workspace";

  if (code) {
    const supabase = await createServerSupabaseForNext();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Sync the provider identity (name, email, pfp) onto user_profiles
      // right after login. Non-fatal on failure — login continues.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await syncProfileFromAuth(
          supabase,
          user.id,
          identityFromAuthUser(user),
        );
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=unable-to-sign-in`);
}
