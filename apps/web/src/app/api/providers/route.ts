import { requireUser } from "@aevryn/auth";
import { checkExternalUrl } from "@aevryn/agent";
import { UserDataService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userDataService = new UserDataService();

const providerInputSchema = z.object({
	slug: z.string().min(1).max(64),
	displayName: z.string().min(1).max(120),
	baseUrl: z.string().url(),
	apiKey: z.string().min(1), // plaintext in transit over TLS; stored encrypted
	models: z
		.array(
			z.object({
				id: z.string().min(1),
				displayName: z.string().optional(),
			}),
		)
		.max(50)
		.default([]),
});

export async function GET(): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const rows = await userDataService.listProviders(user.id);

	return Response.json(
		{ data: rows, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	let body: z.infer<typeof providerInputSchema>;
	try {
		body = providerInputSchema.parse(await request.json());
	} catch (err) {
		return jsonError(400, "BAD_REQUEST", `Invalid provider: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Reject base URLs that point at private/metadata endpoints (SSRF guard).
	const urlVerdict = checkExternalUrl(body.baseUrl);
	if (urlVerdict.blocked) {
		return jsonError(400, "INVALID_BASE_URL", `Provider base URL rejected: ${urlVerdict.reason}`);
	}

	const row = await userDataService.upsertProvider({
		userId: user.id,
		slug: body.slug,
		displayName: body.displayName,
		baseUrl: body.baseUrl,
		apiKey: body.apiKey,
		models: body.models,
	});

	return Response.json(
		{ data: row, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

// Set the model list for a provider: append ONE model (no key re-entry), or
// replace the whole ordered list (drag/reorder from the settings UI).
const modelAppendSchema = z.object({
	slug: z.string().min(1).max(64),
	modelId: z.string().min(1).max(120).optional(),
	displayName: z.string().max(120).optional(),
	models: z
		.array(
			z.object({
				id: z.string().min(1),
				displayName: z.string().optional(),
			}),
		)
		.max(50)
		.optional(),
});

export async function PATCH(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	let body: z.infer<typeof modelAppendSchema>;
	try {
		body = modelAppendSchema.parse(await request.json());
	} catch (err) {
		return jsonError(400, "BAD_REQUEST", `Invalid model: ${err instanceof Error ? err.message : String(err)}`);
	}

	let row: { id: string; slug: string };
	try {
		row = await userDataService.updateProviderModels(user.id, body.slug, {
			modelId: body.modelId,
			displayName: body.displayName,
			models: body.models,
		});
	} catch (err) {
		if ((err as { code?: string }).code === "PROVIDER_NOT_FOUND") {
			return jsonError(404, "NOT_FOUND", "Provider not found. Save its API key first (Settings → API Keys).");
		}
		if ((err as { code?: string }).code === "MODEL_EXISTS") {
			return jsonError(409, "MODEL_EXISTS", `Model '${body.modelId}' already exists on this provider.`);
		}
		throw err;
	}

	return Response.json(
		{ data: row, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}

export async function DELETE(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const slug = new URL(request.url).searchParams.get("slug");
	if (!slug) {
		return jsonError(400, "BAD_REQUEST", "slug query param is required.");
	}

	await userDataService.deleteProvider(user.id, slug);

	return Response.json(
		{ data: { deleted: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
