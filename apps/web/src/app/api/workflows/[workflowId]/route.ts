import { requireUser } from "@aevryn/auth";
import { workflowService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	objective: z.string().max(4_000).optional(),
	instructions: z.string().max(8_000).nullable().optional(),
	autoApprove: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function GET(
	_request: Request,
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

	const result = await workflowService.getWithSteps({
		workflowId,
		userId: user.id,
	});
	if (!result) {
		return jsonError(404, "NOT_FOUND", "Workflow not found.");
	}
	return Response.json(
		{ data: result, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function PATCH(
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
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input.");
	}

	const row = await workflowService.update({
		workflowId,
		userId: user.id,
		patch: parsed.data,
	});
	if (!row) {
		return jsonError(404, "NOT_FOUND", "Workflow not found.");
	}
	return Response.json(
		{ data: { workflow: row }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function DELETE(
	_request: Request,
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

	const deleted = await workflowService.delete({
		workflowId,
		userId: user.id,
	});
	if (!deleted) {
		return jsonError(404, "NOT_FOUND", "Workflow not found.");
	}
	return Response.json(
		{ data: { deleted: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
