import { requireUser } from "@aevryn/auth";
import { db, encryptSecret, userKeys } from "@aevryn/db";
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

	const rows = await db
		.select({ name: userKeys.name, updatedAt: userKeys.updatedAt })
		.from(userKeys)
		.where(eq(userKeys.userId, user.id));

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

	let body: z.infer<typeof keyInputSchema>;
	try {
		body = keyInputSchema.parse(await request.json());
	} catch (err) {
		return jsonError(400, "BAD_REQUEST", `Invalid key payload: ${err instanceof Error ? err.message : String(err)}`);
	}

	const [row] = await db
		.insert(userKeys)
		.values({
			userId: user.id,
			name: body.name,
			encryptedValue: encryptSecret(body.value),
		})
		.onConflictDoUpdate({
			target: [userKeys.userId, userKeys.name],
			set: {
				encryptedValue: encryptSecret(body.value),
				updatedAt: new Date(),
			},
		})
		.returning({ name: userKeys.name });

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

	const name = new URL(request.url).searchParams.get("name");
	if (!name || !(KEY_NAMES as readonly string[]).includes(name)) {
		return jsonError(400, "BAD_REQUEST", "A valid key name is required.");
	}

	await db
		.delete(userKeys)
		.where(and(eq(userKeys.userId, user.id), eq(userKeys.name, name)));

	return Response.json(
		{ data: { deleted: true }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
