import type { Metadata } from "next";

import { db, threads } from "@aevryn/db";
import { eq } from "drizzle-orm";

import { ThreadClient } from "./thread-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceId: string; threadId: string }>;
}): Promise<Metadata> {
  const { threadId } = await params;

  const [thread] = await db
    .select({ title: threads.title })
    .from(threads)
    .where(eq(threads.id, threadId));

  if (!thread?.title) {
    return { title: "New Chat" };
  }
  return { title: thread.title };
}

export default function ThreadPage() {
  return <ThreadClient />;
}
