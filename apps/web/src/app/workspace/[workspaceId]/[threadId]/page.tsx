import { requireUser } from "@aevryn/auth";
import { db, threads } from "@aevryn/db";
import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

import { ThreadClient } from "./thread-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ workspaceId: string; threadId: string }>;
}): Promise<Metadata> {
	const { threadId } = await params;

	// User-scoped: an unauthenticated or non-owner request must not be able
	// to enumerate other users' thread titles via a crafted URL.
	let title: string | undefined;
	try {
		const supabase = await createServerSupabaseForNext();
		const user = await requireUser(supabase);
		const [thread] = await db
			.select({ title: threads.title })
			.from(threads)
			.where(and(eq(threads.id, threadId), eq(threads.userId, user.id)))
			.limit(1);
		title = thread?.title;
	} catch {
		// Unauthenticated — fall through to the generic title.
	}

	if (!title) {
		return { title: "New Chat" };
	}
	return { title };
}

export default function ThreadPage() {
	return <ThreadClient />;
}
