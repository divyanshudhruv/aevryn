import { requireUser } from "@aevryn/auth";
import { UserDataService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsInputSchema = z.object({
	notifications: z
		.object({
			runFailed: z.boolean(),
			runCompleted: z.boolean(),
			runApproval: z.boolean(),
			runRetrying: z.boolean(),
		})
		.partial()
		.optional(),
	defaultModel: z
		.object({
			providerSlug: z.string().min(1),
			modelId: z.string().min(1),
		})
		.nullable()
		.optional(),
	memoryEnabled: z.boolean().nullable().optional(),
	defaultQuality: z.enum(["auto", "high", "medium", "low"]).optional(),
});

async function requireUserOr401(): Promise<{ id: string }> {
	const supabase = await createServerSupabaseForNext();
	try {
		return await requireUser(supabase);
	} catch {
		throw jsonErrorResponse(401, "UNAUTHENTICATED", "Sign in first.");
	}
}

function jsonErrorResponse(
	status: number,
	code: string,
	message: string,
): Response {
	return jsonError(status, code, message);
}

export async function GET(): Promise<Response> {
	const user = await requireUserOr401();
	const userDataService = new UserDataService();
	const data = await userDataService.getSettings(user.id);
	return Response.json(
		{ data, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function PUT(request: Request): Promise<Response> {
	const user = await requireUserOr401();

	let body: z.infer<typeof settingsInputSchema>;
	try {
		body = settingsInputSchema.parse(await request.json());
	} catch (err) {
		return jsonError(400, "BAD_REQUEST", `Invalid settings: ${err instanceof Error ? err.message : String(err)}`);
	}

	const userDataService = new UserDataService();
	const merged = await userDataService.updateSettings(user.id, body);

	return Response.json(
		{ data: merged, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
