import { requireUser } from "@aevryn/auth";
import { db, encryptSecret, userProviders } from "@aevryn/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

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

	const rows = await db
		.select({
			id: userProviders.id,
			slug: userProviders.slug,
			displayName: userProviders.displayName,
			baseUrl: userProviders.baseUrl,
			models: userProviders.models,
			createdAt: userProviders.createdAt,
		})
		.from(userProviders)
		.where(eq(userProviders.userId, user.id));

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

	// Re-saving a key (Keys tab) must not wipe the provider's models when the
	// caller sends none.
	const [existing] = await db
		.select({ models: userProviders.models })
		.from(userProviders)
		.where(
			and(eq(userProviders.userId, user.id), eq(userProviders.slug, body.slug)),
		)
		.limit(1);
	const models = body.models.length > 0 ? body.models : (existing?.models ?? []);

	const [row] = await db
		.insert(userProviders)
		.values({
			userId: user.id,
			slug: body.slug,
			displayName: body.displayName,
			baseUrl: body.baseUrl,
			apiKeyEncrypted: encryptSecret(body.apiKey),
			models,
		})
		.onConflictDoUpdate({
			target: [userProviders.userId, userProviders.slug],
			set: {
				displayName: body.displayName,
				baseUrl: body.baseUrl,
				apiKeyEncrypted: encryptSecret(body.apiKey),
				models,
				updatedAt: new Date(),
			},
		})
		.returning({ id: userProviders.id, slug: userProviders.slug });

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

	const [existing] = await db
		.select({ models: userProviders.models })
		.from(userProviders)
		.where(
			and(eq(userProviders.userId, user.id), eq(userProviders.slug, body.slug)),
		)
		.limit(1);
	if (!existing) {
		return jsonError(404, "NOT_FOUND", "Provider not found. Save its API key first (Settings → API Keys).");
	}

	let models: z.infer<typeof modelAppendSchema>["models"] = existing.models;
	if (body.models) {
		models = body.models;
	} else if (body.modelId) {
		if (existing.models.some((m) => m.id === body.modelId)) {
			return jsonError(409, "MODEL_EXISTS", `Model '${body.modelId}' already exists on this provider.`);
		}
		models = [
			...existing.models,
			{ id: body.modelId, ...(body.displayName ? { displayName: body.displayName } : {}) },
		];
	}

	const [row] = await db
		.update(userProviders)
		.set({ models, updatedAt: new Date() })
		.where(
			and(eq(userProviders.userId, user.id), eq(userProviders.slug, body.slug)),
		)
		.returning({ id: userProviders.id, slug: userProviders.slug });

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

	await db
		.delete(userProviders)
		.where(
			and(eq(userProviders.userId, user.id), eq(userProviders.slug, slug)),
		);

	return Response.json(
		{ data: { deleted: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
