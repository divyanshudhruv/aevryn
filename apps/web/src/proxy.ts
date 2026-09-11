import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { evlogMiddleware } from "evlog/next";

const evlog = evlogMiddleware();

function createSupabase(request: NextRequest, response: NextResponse<unknown>) {
	return createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			cookies: {
				getAll() {
					return request.cookies.getAll();
				},
				setAll(cookiesToSet) {
					cookiesToSet.forEach(({ name, value }) =>
						request.cookies.set(name, value),
					);
					cookiesToSet.forEach(({ name, value, options }) =>
						response.cookies.set(name, value, options),
					);
				},
			},
		},
	);
}

function isPublicPath(pathname: string) {
	return (
		pathname === "/login" ||
		pathname.startsWith("/login/") ||
		pathname.startsWith("/auth/")
	);
}

export async function proxy(request: NextRequest) {
	const response: NextResponse<unknown> = (await evlog(request)) as NextResponse<unknown>;

	const supabase = createSupabase(request, response);

	// Refresh the session token if it's close to expiry (writes cookies).
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const { pathname } = request.nextUrl;

	// Unauthenticated page requests → login.
	if (!user && !isPublicPath(pathname)) {
		const url = request.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("next", pathname);
		return NextResponse.redirect(url);
	}

	// Authenticated users skip login/root and land in the app.
	if (user && (isPublicPath(pathname) || pathname === "/")) {
		const url = request.nextUrl.clone();
		url.pathname = "/workspace";
		url.search = "";
		return NextResponse.redirect(url);
	}

	return response;
}

export const config = {
	matcher: [
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
	],
};