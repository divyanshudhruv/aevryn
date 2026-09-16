import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export default async function proxy(req: NextRequest) {
	let res = NextResponse.next({ request: { headers: req.headers } });

	const supabase = createServerClient(
		// Validated at boot by @aevryn/env/server (proxy runs on the Node.js
		// runtime in this Next version) — fall back to "" rather than assert.
		process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
		{
			cookies: {
				getAll() {
					return req.cookies.getAll();
				},
				setAll(cookiesToSet) {
					for (const { name, value } of cookiesToSet) {
						req.cookies.set(name, value);
					}
					res = NextResponse.next({ request: { headers: req.headers } });
					for (const { name, value, options } of cookiesToSet) {
						res.cookies.set(name, value, options);
					}
				},
			},
		},
	);

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const path = req.nextUrl.pathname;
	const isProtected = path.startsWith("/workspace");
	const isPublic =
		path === "/" || path === "/signup" || path.startsWith("/auth");

	if (isProtected && !user) {
		return NextResponse.redirect(new URL("/signup", req.url));
	}
	if (isPublic && user) {
		return NextResponse.redirect(new URL("/workspace", req.url));
	}

	return res;
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
