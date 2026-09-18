import { env } from "@aevryn/env/server";
import type { CookieMethodsServer } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";

export function createServerSupabase(cookies: CookieMethodsServer) {
	return createServerClient(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			cookies,
		},
	);
}

export type { CookieMethodsServer };
