const MAX_UNTRUSTED_CHARS = 12_000;

const CLOSE_TAG = /<\/untrusted>/gi;
const OPEN_TAG = /<untrusted>/gi;

/**
 * Wraps externally-sourced content (scraped pages, search answers, agent
 * output) in `<untrusted>…</untrusted>` tags before it is injected into LLM
 * context, and truncates it so a single result can't blow the context window.
 *
 * Source-controlled text (system prompt, tool descriptions, plans) lives OUT
 * of the tags; the model is told in the system prompt to treat tagged content
 * strictly as data and never as instructions — the standard fix for prompt
 * injection via web content.
 *
 * Both `<untrusted>` tags in the incoming text are neutralized so hostile
 * content can't create a fake closing tag and smuggle instructions past the
 * wrapper. Returns a string always bounded by `<untrusted>\n` … `\n</untrusted>`.
 */
export function wrapUntrusted(text: string, maxChars = MAX_UNTRUSTED_CHARS): string {
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

/** Same as {@link wrapUntrusted} but for structured values (JSON payloads). */
export function wrapUntrustedJson(value: unknown, maxChars = MAX_UNTRUSTED_CHARS): string {
	return wrapUntrusted(JSON.stringify(value), maxChars);
}

/** Null-safe {@link wrapUntrusted} for optional fields — returns undefined untouched. */
export function wrapUntrustedMaybe(
	value: string | undefined,
	maxChars = MAX_UNTRUSTED_CHARS,
): string | undefined {
	return value == null ? value : wrapUntrusted(value, maxChars);
}