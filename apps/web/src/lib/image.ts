const MAX_IMAGE_SIZE = 2000;
const JPEG_FALLBACK = 0.5;

/**
 * Downscale + re-encode an image client-side (canvas → WebP quality 0.8,
 * longest edge capped at 2000px). Returns a Blob, never throws for unreadable
 * sources — callers should check dimensions.
 */
export async function compressImage(file: Blob): Promise<{
	blob: Blob;
	width: number;
	height: number;
}> {
	const bitmap = await createImageBitmap(file);
	const longest = Math.max(bitmap.width, bitmap.height);
	const scale = Math.min(1, MAX_IMAGE_SIZE / longest);
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d")!;
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const blob = await new Promise<Blob | null>(resolve =>
		canvas.toBlob(resolve, "image/webp", 0.8),
	);

	if (blob) {
		return { blob, width, height };
	}

	const fallback = await new Promise<Blob | null>(resolve =>
		canvas.toBlob(resolve, "image/jpeg", JPEG_FALLBACK),
	);

	return { blob: fallback ?? file, width, height };
}