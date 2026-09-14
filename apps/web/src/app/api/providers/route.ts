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

	const [row] = await db
		.insert(userProviders)
		.values({
			userId: user.id,
			slug: body.slug,
			displayName: body.displayName,
			baseUrl: body.baseUrl,
			apiKeyEncrypted: encryptSecret(body.apiKey),
			models: body.models,
		})
		.onConflictDoUpdate({
			target: [userProviders.userId, userProviders.slug],
			set: {
				displayName: body.displayName,
				baseUrl: body.baseUrl,
				apiKeyEncrypted: encryptSecret(body.apiKey),
				models: body.models,
				updatedAt: new Date(),
			},
		})
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
