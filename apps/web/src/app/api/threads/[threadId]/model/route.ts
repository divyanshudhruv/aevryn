import { requireUser } from "@aevryn/auth";
import { threadReadModelService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thread read model — one coherent fetch for the thread page.
 */
export async function GET(
	_request: Request,
	ctx: { params: Promise<{ threadId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return Response.json(
			{ data: null, error: { code: "UNAUTHENTICATED", message: "Sign in first." } },
			{ status: 401, headers: { "cache-control": "no-store" } },
		);
	}
	const { threadId } = await ctx.params;

	const model = await threadReadModelService.get({
		threadId,
		userId: user.id,
	});
	if (!model) {
		return Response.json(
			{ data: null, error: { code: "THREAD_NOT_FOUND", message: "Thread does not exist." } },
			{ status: 404, headers: { "cache-control": "no-store" } },
		);
	}

	return Response.json(
		{ data: model, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
