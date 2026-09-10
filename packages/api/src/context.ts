import { randomUUID } from "node:crypto";

import { getSessionUser } from "@aevryn/auth";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
	const session = await getSessionUser(req);
	return {
		auth: null,
		session,
		requestId: randomUUID(),
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
