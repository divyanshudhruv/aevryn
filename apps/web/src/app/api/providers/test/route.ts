import { requireUser } from "@aevryn/auth";
import { UserDataService } from "@aevryn/workflow";
import { generateText } from "ai";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Test message streams the configured provider; a cold model hop can exceed
// the default 10s cap.
export const maxDuration = 120;

const userDataService = new UserDataService();

export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const rateLimited = enforceRateLimit({
		key: `provider-test:${user.id}`,
		windowMs: 60_000,
		limit: 10,
	});
	if (rateLimited) return rateLimited;

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

	const row = await userDataService.getProvider(user.id, slug);

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
