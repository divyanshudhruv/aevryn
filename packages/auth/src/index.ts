import { env } from "@aevryn/env/web";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export interface SupabaseConfig {
	url: string;
	anonKey: string;
}

export function resolveSupabaseConfig(): SupabaseConfig {
	const url = env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey =
		env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
		env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	if (!anonKey) {
		throw new Error(
			"Missing Supabase anon key: set NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
		);
	}
	return { url, anonKey };
}

let browserClient: SupabaseClient | null = null;

/** Client components: cookie-backed browser session, singleton. */
export function createBrowserSupabase(): SupabaseClient {
	if (browserClient) return browserClient;
	const { url, anonKey } = resolveSupabaseConfig();
	browserClient = createBrowserClient(url, anonKey);
	return browserClient;
}

/**
 * Server (route handler / server action) client built from a NextRequest's
 * cookies. Read-only setAll: the proxy chain is responsible for rotating the
 * access token, so handlers only read the cookie the browser already sent.
 */
export function createServerSupabase(req: NextRequest): SupabaseClient {
	const { url, anonKey } = resolveSupabaseConfig();
	return createServerClient(url, anonKey, {
		cookies: {
			getAll: () => req.cookies.getAll(),
			setAll: () => {
				// Intentionally no-op: read-only adapter for handlers.
			},
		},
	});
}

export interface SessionUser {
	id: string;
	email: string;
	name: string;
	image: string | null;
}

/** Shape kept congruent with the previous ctx.session so tRPC routers don't change. */
export type Session = { user: SessionUser } | null;

export async function getSessionUser(req: NextRequest): Promise<Session> {
	const supabase = createServerSupabase(req);
	const { data, error } = await supabase.auth.getUser();
	if (error || !data.user) return null;
	const meta = data.user.user_metadata as Record<string, unknown>;
	return {
		user: {
			id: data.user.id,
			email: data.user.email ?? "",
			name:
				(typeof meta.name === "string" && meta.name) ||
				data.user.email ||
				"User",
			image: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
		},
	};
}
