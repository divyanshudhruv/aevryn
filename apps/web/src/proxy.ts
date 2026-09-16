import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export default async function proxy(req: NextRequest) {
	let res = NextResponse.next({ request: { headers: req.headers } });

	const supabase = createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			cookies: {
				getAll() {
					return req.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value }) =>
						req.cookies.set(name, value),
					);
					res = NextResponse.next({ request: { headers: req.headers } });
					cookiesToSet.forEach(({ name, value, options }) =>
						res.cookies.set(name, value, options),
					);
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
