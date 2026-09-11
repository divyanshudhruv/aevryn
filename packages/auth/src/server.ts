import { createServerClient } from "@supabase/ssr";
import type { CookieMethodsServer } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { env } from "@aevryn/env/server";

export function createServerSupabase(cookies: CookieMethodsServer) {
	return createServerClient(
		env.NEXT_PUBLIC_SUPABASE_URL,
		env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		{
			cookies,
		},
	);
}

export function createAdminClient() {
	return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

export type { CookieMethodsServer };