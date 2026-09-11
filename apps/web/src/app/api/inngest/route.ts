import { inngest, notificationNotifier, scheduleTick, threadRun } from "@aevryn/inngest";
import { serve } from "inngest/next";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: [threadRun, scheduleTick, notificationNotifier],
});
