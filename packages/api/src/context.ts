import { randomUUID } from "node:crypto";

import { auth } from "@aevryn/auth";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
	const session = await auth.api.getSession({
		headers: req.headers,
	});
	return {
		auth: null,
		session,
		requestId: randomUUID(),
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
