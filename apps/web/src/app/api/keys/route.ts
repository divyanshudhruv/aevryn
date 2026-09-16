import { requireUser } from "@aevryn/auth";
import { UserDataService } from "@aevryn/workflow";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userDataService = new UserDataService();

// Extensible key names — Anakin and Mem0 today, more services later.
const KEY_NAMES = ["anakin", "mem0"] as const;

const keyInputSchema = z.object({
	name: z.enum(KEY_NAMES),
	value: z.string().min(1), // plaintext over TLS; stored AES-256-GCM encrypted
});

export async function GET(): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const rows = await userDataService.listKeys(user.id);

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

	const rateLimited = enforceRateLimit({
		key: `keys:${user.id}`,
		windowMs: 60_000,
		limit: 20,
	});
	if (rateLimited) return rateLimited;

	let body: z.infer<typeof keyInputSchema>;
	try {
		body = keyInputSchema.parse(await request.json());
	} catch (err) {
		return jsonError(400, "BAD_REQUEST", `Invalid key payload: ${err instanceof Error ? err.message : String(err)}`);
	}

	const row = await userDataService.upsertKey(user.id, body.name, body.value);

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

	const rateLimited = enforceRateLimit({
		key: `keys:${user.id}`,
		windowMs: 60_000,
		limit: 20,
	});
	if (rateLimited) return rateLimited;

	const name = new URL(request.url).searchParams.get("name");
	if (!name || !(KEY_NAMES as readonly string[]).includes(name)) {
		return jsonError(400, "BAD_REQUEST", "A valid key name is required.");
	}

	await userDataService.deleteKey(user.id, name);

	return Response.json(
		{ data: { deleted: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
