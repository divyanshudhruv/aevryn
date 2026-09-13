import { inArray } from "drizzle-orm";

import { threads, workflows } from "@aevryn/db";
import { db } from "@aevryn/db";
import { threadStatus } from "@aevryn/db/domain";
import { type RunStatus, type WorkflowStatus } from "@aevryn/db/domain";
import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { requireUser } from "@aevryn/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function makeErrorResponse(name: string, message: string, status: number) {
	return new Response(
		JSON.stringify({ error: { name, message, code: name } }),
		{
			status,
			headers: { "content-type": "application/json", "cache-control": "no-store" },
		},
	);
}

export async function POST(request: Request): Promise<NextResponse> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return makeErrorResponse("UNAUTHORIZED", "Sign in first.", 401);
	}

	let body: { threadIds?: string[] } | null = null;
	try {
		body = await request.json();
	} catch {
		body = null;
	}

	if (!body?.threadIds?.length) {
		return makeErrorResponse("BAD_REQUEST", "`threadIds` is required.", 400);
	}

	const limit = Math.min(body.threadIds.length, 200);
	const threadIds = body.threadIds.slice(0, limit);

	const threadRows = await db.query.threads.findMany({
		where: inArray(threads.id, threadIds),
		columns: { id: true, boundWorkflowId: true },
	});

	const threadMap = new Map(threadRows.map((t) => [t.id, t.boundWorkflowId]));
	const workflowIds = threadRows
		.filter((t) => t.boundWorkflowId)
		.map((t) => t.boundWorkflowId!);

	const workflowStatusMap = new Map<string, WorkflowStatus | null>();
	if (workflowIds.length) {
		const workflowRows = await db.query.workflows.findMany({
			where: inArray(workflows.id, workflowIds),
			columns: { id: true, status: true },
		});
		for (const w of workflowRows) {
			workflowStatusMap.set(w.id, w.status);
		}
	}

	const results = threadIds.map((id) => {
		const boundWorkflowId = threadMap.get(id) ?? null;
		const workflowStatus = boundWorkflowId
			? (workflowStatusMap.get(boundWorkflowId) ?? null)
			: null;
		return {
			threadId: id,
			status: threadStatus(workflowStatus as WorkflowStatus | null) as RunStatus,
		};
	});

	return new NextResponse(JSON.stringify({ results }), {
		status: 200,
		headers: { "content-type": "application/json", "cache-control": "no-store" },
	});
}

