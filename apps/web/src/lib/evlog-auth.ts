import { getSessionUser } from "@aevryn/auth";
import type { NextRequest } from "next/server";

import { useLogger } from "@/lib/evlog";

export async function identifyEvlogUser(request: NextRequest) {
	const session = await getSessionUser(request);
	if (!session) return;
	useLogger().set({
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
		},
	});
}
