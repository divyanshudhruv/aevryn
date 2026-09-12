import { z } from "zod";

import { requireUser } from "@aevryn/auth";
import { db, files, ids } from "@aevryn/db";
import { ThreadService } from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "chat-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/heic",
	"image/heif",
	"image/gif",
	"image/svg+xml",
]);

const threadService = new ThreadService();

const schema = z.object({
	threadId: z.string().min(1).optional(),
});

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

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return jsonError(400, "INVALID_PAYLOAD", "Expected a multipart form-data body.");
	}

	const parsed = schema.safeParse({
		threadId: form.get("threadId") || undefined,
	});
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "Invalid `threadId`.");
	}

	const file = form.get("file");
	if (!(file instanceof File)) {
		return jsonError(400, "INVALID_PAYLOAD", "A `file` part is required.");
	}
	if (file.size === 0 || file.size > MAX_BYTES) {
		return jsonError(413, "FILE_TOO_LARGE", "File is empty or exceeds 10 MB.");
	}
	const mime = file.type.toLowerCase();
	if (!ALLOWED.has(mime)) {
		return jsonError(415, "UNSUPPORTED_TYPE", "Only image uploads are supported.");
	}

	let workspaceId: string | undefined;
	if (parsed.data.threadId) {
		const thread = await threadService.findById(parsed.data.threadId);
		if (!thread || thread.deletedAt) {
			return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
		}
		if (thread.userId !== user.id) {
			return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
		}
		workspaceId = thread.workspaceId;
	}

	if (!workspaceId) {
		return jsonError(403, "FORBIDDEN", "A `threadId` is required.");
	}

	const fileId = ids.file();
	const fileName = file.name ? sanitize(file.name) : "upload";
	const path = `${user.id}/${fileId}.${extensionOf(mime)}`;

	const bytes = new Uint8Array(await file.arrayBuffer());

	// Bucket may not exist yet on a fresh project; `createBucket` is idempotent.
	await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {});

	const { error: uploadError } = await supabase.storage
		.from(BUCKET)
		.upload(path, bytes, { contentType: mime, upsert: false });
	if (uploadError) {
		return jsonError(500, "UPLOAD_FAILED", uploadError.message);
	}

	await db
		.insert(files)
		.values({
			id: fileId,
			userId: user.id,
			threadId: parsed.data.threadId ?? null,
			workspaceId,
			bucket: BUCKET,
			path,
			mimeType: mime,
			sizeBytes: bytes.byteLength,
			compressed: mime === "image/webp",
		});

	const { data: publicUrl } = supabase.storage
		.from(BUCKET)
		.getPublicUrl(path);
	void fileName;

	return Response.json(
		{
			data: {
				id: fileId,
				bucket: BUCKET,
				path,
				mimeType: mime,
				sizeBytes: bytes.byteLength,
				compressed: mime === "image/webp",
				url: publicUrl.publicUrl,
			},
			error: null,
			meta: {},
		},
		{ headers: { "cache-control": "no-store" } },
	);
}

function sanitize(name: string): string {
	return name.replace(/[^\w.-]+/g, "_").slice(0, 100);
}

function extensionOf(mime: string): string {
	switch (mime) {
		case "image/jpeg":
			return "jpeg";
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/heic":
			return "heic";
		case "image/heif":
			return "heif";
		case "image/gif":
			return "gif";
		case "image/svg+xml":
			return "svg";
		default:
			return "img";
	}
}