import { ANAKIN_BASE_URL, resolveAnakinKey } from "@aevryn/agent";
import { requireUser } from "@aevryn/auth";

import { jsonError } from "@/lib/api";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Polls a remote Anakin job that can take well over the default 10s cap.
export const maxDuration = 300;

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const { jobId } = await params;
	if (!jobId) {
		return jsonError(400, "BAD_REQUEST", "A screenshot job id is required.");
	}

	const type = new URL(request.url).searchParams.get("type") ?? "viewport";
	if (type !== "viewport" && type !== "fullpage") {
		return jsonError(400, "BAD_REQUEST", "type must be 'viewport' or 'fullpage'.");
	}

	const apiKey = await resolveAnakinKey(user.id);
	if (!apiKey) {
		return jsonError(401, "ANAKIN_KEY_REQUIRED", "Add your Anakin key in Settings → BYOK.");
	}

	const upstream = await fetch(
		`${ANAKIN_BASE_URL}/url-scraper/${encodeURIComponent(jobId)}/screenshot?type=${type}`,
		{ headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(60_000) },
	);

	if (upstream.status === 401 || upstream.status === 403) {
		return jsonError(upstream.status, "ANAKIN_FORBIDDEN", "Anakin rejected the key for this job.");
	}
	if (upstream.status === 404) {
		return jsonError(404, "NOT_FOUND", "No screenshot exists for this job.");
	}
	if (!upstream.ok) {
		return jsonError(502, "ANAKIN_UPSTREAM_ERROR", `Anakin returned ${upstream.status}.`);
	}

	const bytes = await upstream.arrayBuffer();
	return new Response(bytes, {
		status: 200,
		headers: {
			"content-type": upstream.headers.get("content-type") ?? "image/png",
			"cache-control": "private, max-age=300",
		},
	});
}
