import { env } from "@aevryn/env/web";
import { createBrowserClient } from "@supabase/ssr";

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
