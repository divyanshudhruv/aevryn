import { requireUser } from "@aevryn/auth";
import { db, decryptSecret, userKeys } from "@aevryn/db";
import { and, eq } from "drizzle-orm";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANAKIN_BASE_URL = "https://api.anakin.io/v1";

async function resolveAnakinKey(userId: string): Promise<string | null> {
	const rows = await db
		.select({ encryptedValue: userKeys.encryptedValue })
		.from(userKeys)
		.where(and(eq(userKeys.userId, userId), eq(userKeys.name, "anakin")));
	const row = rows[0];
	if (!row) return null;
	try {
		return decryptSecret(row.encryptedValue);
	} catch {
		return null;
	}
}

function errorResponse(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return errorResponse(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const { jobId } = await params;
	if (!jobId) {
		return errorResponse(400, "BAD_REQUEST", "A Wire job id is required.");
	}

	const file = new URL(request.url).searchParams.get("file");

	const apiKey = await resolveAnakinKey(user.id);
	if (!apiKey) {
		return errorResponse(401, "ANAKIN_KEY_REQUIRED", "Add your Anakin key in Settings → BYOK.");
	}

	const upstream = await fetch(
		`${ANAKIN_BASE_URL}/wire/jobs/${encodeURIComponent(jobId)}/download${file ? `?file=${encodeURIComponent(file)}` : ""}`,
		{ headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(120_000) },
	);

	if (upstream.status === 400) {
		return errorResponse(400, "NO_DOWNLOAD", "This job has no downloadable result for that file name.");
	}
	if (upstream.status === 401 || upstream.status === 403) {
		return errorResponse(upstream.status, "ANAKIN_FORBIDDEN", "Anakin rejected the key for this job.");
	}
	if (upstream.status === 404) {
		return errorResponse(404, "NOT_FOUND", "No such Wire job.");
	}
	if (!upstream.ok) {
		return errorResponse(502, "ANAKIN_UPSTREAM_ERROR", `Anakin returned ${upstream.status}.`);
	}

	const bytes = await upstream.arrayBuffer();
	const headers: Record<string, string> = {
		"cache-control": "private, max-age=300",
	};
	const contentType = upstream.headers.get("content-type");
	if (contentType) headers["content-type"] = contentType;
	const disposition = upstream.headers.get("content-disposition");
	if (disposition) headers["content-disposition"] = disposition;

	return new Response(bytes, { status: 200, headers });
}
