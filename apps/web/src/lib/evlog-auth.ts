import { identifyUser } from "evlog/better-auth";

import { createServerSupabase, getCurrentUser } from "@aevryn/auth";
import type { CookieMethodsServer } from "@aevryn/auth";

import { useLogger } from "@/lib/evlog";

function cookieMethodsFromRequest(req: Request): CookieMethodsServer {
	const cookies = new Map<string, string>();
	const header = req.headers.get("cookie");
	if (header) {
		for (const part of header.split(";")) {
			const eq = part.indexOf("=");
			if (eq <= 0) continue;
			const name = part.slice(0, eq).trim();
			const value = decodeURIComponent(part.slice(eq + 1).trim());
			if (name) cookies.set(name, value);
		}
	}
	return {
		getAll() {
			return Array.from(cookies, ([name, value]) => ({ name, value }));
		},
		setAll() {
			// Read-only: token refresh handled by the proxy.
		},
	};
}

export async function identifyEvlogUser(req: Request) {
	const supabase = createServerSupabase(cookieMethodsFromRequest(req));
	const user = await getCurrentUser(supabase);
	if (!user) return;
	identifyUser(
		useLogger(),
		{ user: { id: user.id, email: user.email }, session: {} },
		{ maskEmail: true },
	);
}