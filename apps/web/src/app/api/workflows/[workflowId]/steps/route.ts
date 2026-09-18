import { requireUser } from "@aevryn/auth";
import { workflowService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Runs workflow steps through the agent; a multi-step execution can blow past
// the default 10s cap.
export const maxDuration = 300;

const stepsSchema = z.object({
	steps: z
		.array(
			z.object({
				/** Existing step id — keeps its status. Omit for a new step. */
				id: z.string().optional(),
				title: z.string().min(1).max(300),
				description: z.string().max(2_000).nullable().optional(),
			}),
		)
		.max(50),
});

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function PUT(
	request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { workflowId } = await params;
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
	}
	const parsed = stepsSchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(
			400,
			"VALIDATION_ERROR",
			parsed.error.issues[0]?.message ?? "Invalid input.",
		);
	}

	try {
		const steps = await workflowService.replaceSteps({
			workflowId,
			userId: user.id,
			steps: parsed.data.steps,
		});
		return Response.json(
			{ data: { steps }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	} catch {
		return jsonError(404, "NOT_FOUND", "Workflow not found.");
	}
}
