import { auth } from "@aevryn/auth";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";

import { useLogger } from "@/lib/evlog";

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: ["/api/auth/**"],
	maskEmail: true,
});

export async function identifyEvlogUser(request: Request) {
	await identifyUser(
		useLogger(),
		request.headers,
		new URL(request.url).pathname,
	);
}
