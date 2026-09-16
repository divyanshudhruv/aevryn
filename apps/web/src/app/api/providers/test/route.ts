import { requireUser } from "@aevryn/auth";
import { db, userProviders } from "@aevryn/db";
import { eq, and } from "drizzle-orm";
import { generateText } from "ai";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
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

	let body: { slug?: string; modelId?: string };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		body = {};
	}

	const slug = body.slug;
	if (!slug) {
		return jsonError(400, "BAD_REQUEST", "slug is required.");
	}

	const [row] = await db
		.select({
			id: userProviders.id,
			slug: userProviders.slug,
			displayName: userProviders.displayName,
			baseUrl: userProviders.baseUrl,
			apiKeyEncrypted: userProviders.apiKeyEncrypted,
			models: userProviders.models,
		})
		.from(userProviders)
		.where(
			and(
				eq(userProviders.userId, user.id),
				eq(userProviders.slug, slug),
			),
		);

	if (!row) {
		return jsonError(404, "NOT_FOUND", "Provider not found.");
	}

	const modelId =
		body.modelId && row.models.some((m) => m.id === body.modelId)
			? body.modelId
			: row.models[0]?.id;
	if (!modelId) {
		return jsonError(
			400,
			"NO_MODELS",
			"Save at least one model on this provider first.",
		);
	}

	try {
		const { ModelRegistry } = await import("@aevryn/agent");
		const model = ModelRegistry.resolve(row as never, modelId);
		const { text } = await generateText({
			model,
			prompt: "Say exactly the word: pong",
			maxOutputTokens: 4,
		});

		const ok =
			text.trim().length > 0 && !/error|invalid|auth|permission/i.test(text);

		return Response.json(
			{ data: { ok, modelId, reply: text.trim() }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Could not reach the model provider.";
		return Response.json(
			{
				data: { ok: false, modelId, reply: null },
				error: { code: "TEST_FAILED", message, details: null },
				meta: {},
			},
			{ headers: { "cache-control": "no-store" } },
		);
	}
}
