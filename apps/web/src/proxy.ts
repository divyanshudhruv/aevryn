import { resolveSupabaseConfig } from "@aevryn/auth";
import { createServerClient } from "@supabase/ssr";
import { evlogMiddleware } from "evlog/next";
import { type NextRequest, NextResponse } from "next/server";

const evlog = evlogMiddleware();

export async function proxy(request: NextRequest) {
	let response = NextResponse.next({ request });

	const { url, anonKey } = resolveSupabaseConfig();
	const supabase = createServerClient(url, anonKey, {
		cookies: {
			getAll: () => request.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value } of cookies) {
					request.cookies.set(name, value);
				}
				response = NextResponse.next({ request });
				for (const { name, value, options } of cookies) {
					response.cookies.set(name, value, options);
				}
			},
		},
	});

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (request.nextUrl.pathname.startsWith("/workspace") && !user) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("next", request.nextUrl.pathname);
		return NextResponse.redirect(url);
	}

	const evlogResponse = (await evlog(request)) as unknown as NextResponse;

	for (const cookie of response.cookies.getAll()) {
		evlogResponse.cookies.set(cookie.name, cookie.value);
	}
	return evlogResponse;
}

export const config = {
	matcher: ["/api/:path*", "/workspace/:path*"],
};
