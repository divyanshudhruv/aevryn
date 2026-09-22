const MAX_UNTRUSTED_CHARS = 12_000;

const CLOSE_TAG = /<\/untrusted>/gi;
const OPEN_TAG = /<untrusted>/gi;

export function wrapUntrusted(
	text: string,
	maxChars = MAX_UNTRUSTED_CHARS,
): string {
	let clip = text;
	let note = "";
	if (text.length > maxChars) {
		clip = text.slice(0, maxChars);
		note = `\n… [truncated, original ${text.length} chars]`;
	}
	const sanitized = clip
		.replace(CLOSE_TAG, "&lt;/untrusted&gt;")
		.replace(OPEN_TAG, "&lt;untrusted&gt;");
	return `<untrusted>\n${sanitized}${note}\n</untrusted>`;
}

export function wrapUntrustedJson(
	value: unknown,
	maxChars = MAX_UNTRUSTED_CHARS,
): string {
	return wrapUntrusted(JSON.stringify(value), maxChars);
}

export function wrapUntrustedMaybe(
	value: string | undefined,
	maxChars = MAX_UNTRUSTED_CHARS,
): string | undefined {
	return value == null ? value : wrapUntrusted(value, maxChars);
}
