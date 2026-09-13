import { inArray } from "drizzle-orm";

import { threadWorkflowBindings, threads, workflows } from "@aevryn/db";
import { db } from "@aevryn/db";
import type { RunStatus } from "@aevryn/db";
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

/**
 * Bulk thread status read for the sidebar: derives each thread's status from
 * its bound workflow (via thread_workflow_bindings) or its latest run.
 */
export async function POST(request: Request): Promise<Response> {
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
		columns: { id: true },
	});
	const ownedIds = new Set(threadRows.map((t) => t.id));

	const bindings = await db
		.select({ threadId: threadWorkflowBindings.threadId, workflowId: threadWorkflowBindings.workflowId })
		.from(threadWorkflowBindings)
		.where(inArray(threadWorkflowBindings.threadId, threadIds));
	const workflowIds = bindings.map((b) => b.workflowId);

	const workflowStatusMap = new Map<string, RunStatus>();
	if (workflowIds.length) {
		const workflowRows = await db.query.workflows.findMany({
			where: inArray(workflows.id, workflowIds),
			columns: { id: true, status: true },
		});
		for (const w of workflowRows) {
			workflowStatusMap.set(w.id, w.status);
		}
	}
	const bindingMap = new Map(bindings.map((b) => [b.threadId, b.workflowId]));

	const results = threadIds
		.filter((id) => ownedIds.has(id))
		.map((id) => {
			const workflowId = bindingMap.get(id);
			return {
				threadId: id,
				status: (workflowId ? workflowStatusMap.get(workflowId) : undefined) ?? ("running" as RunStatus),
			};
		});

	return new Response(JSON.stringify({ results }), {
		status: 200,
		headers: { "content-type": "application/json", "cache-control": "no-store" },
	});
}
