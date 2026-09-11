import { createBrowserClient } from "@supabase/ssr";

import { env } from "@aevryn/env/web";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getBrowserSupabase() {
	if (!browserClient) {
		browserClient = createBrowserClient(
			env.NEXT_PUBLIC_SUPABASE_URL,
			env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
		);
	}
	return browserClient;
}