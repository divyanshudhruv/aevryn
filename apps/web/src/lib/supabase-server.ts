import { createServerSupabase } from "@aevryn/auth/server";
import { cookies } from "next/headers";

export async function createServerSupabaseForNext() {
	const cookieStore = await cookies();

	return createServerSupabase({
		getAll() {
			return cookieStore.getAll();
		},
		setAll(cookiesToSet) {
			try {
				for (const { name, value, options } of cookiesToSet) {
					cookieStore.set(name, value, options);
				}
			} catch {
				// Server Component — cookie writes handled by the proxy.
			}
		},
	});
}