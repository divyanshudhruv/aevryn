import type { LanguageModelV4ToolCall as V4ToolCall } from "@ai-sdk/provider";
import { InvalidToolInputError, NoSuchToolError, type ToolSet } from "ai";

/**
 * Lenient repair for malformed model-generated tool arguments.
 * gpt-oss-120b (Groq) occasionally emits trailing commas, single quotes,
 * unquoted keys, or truncated JSON. Try a ladder of cheap textual fixes;
 * each fix must actually parse before it is accepted.
 */

const REPAIRS: Array<(text: string) => string> = [
	// 1. As-is (in case the error was schema-shape, not JSON syntax).
	(text) => text,
	// 2. Trailing commas before } or ].
	(text) => text.replace(/,\s*([}\]])/g, "$1"),
	// 3. Smart quotes → straight quotes.
	(text) => text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'"),
	// 4. Single-quoted strings → double-quoted (best-effort; keys first).
	(text) => text.replace(/'([^'\\]*)'/g, '"$1"'),
	// 5. Unquoted object keys → quoted.
	(text) => text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'),
	// 6. All cheap fixes combined (single quotes + unquoted keys, etc.).
	(text) =>
		text
			.replace(/[\u201c\u201d]/g, '"')
			.replace(/[\u2018\u2019]/g, "'")
			.replace(/'([^'\\]*)'/g, '"$1"')
			.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
			.replace(/,\s*([}\]])/g, "$1"),
	// 7. Cut-off generation: drop the incomplete tail, then re-balance any
	//    unclosed [ { by appending the missing brackets.
	function cutOff(text) {
		for (let end = text.length; end > 1; end--) {
			let candidate = text
				.slice(0, end)
				.replace(/,\s*$/, "")
				.replace(/,\s*([}\]])/g, "$1");
			// Close whatever is still open, in reverse order.
			const stack: string[] = [];
			let inString = false;
			let escaped = false;
			for (const ch of candidate) {
				if (escaped) {
					escaped = false;
					continue;
				}
				if (ch === "\\") {
					escaped = true;
					continue;
				}
				if (ch === '"') inString = !inString;
				if (inString) continue;
				if (ch === "[") stack.push("]");
				else if (ch === "{") stack.push("}");
				else if (ch === "]" || ch === "}") stack.pop();
			}
			candidate += stack.reverse().join("");
			try {
				JSON.parse(candidate);
				return candidate;
			} catch {
				continue;
			}
		}
		return text;
	},
];

/** Parse with the repair ladder; returns undefined when nothing works. */
export function repairJsonText(text: string): unknown | undefined {
	for (const fix of REPAIRS) {
		try {
			return JSON.parse(fix(text));
		} catch {
			continue;
		}
	}
	return undefined;
}

/**
 * AI SDK `experimental_repairToolCall` hook: rescues malformed tool-call
 * arguments instead of failing the whole turn. Handles:
 * - invalid JSON syntax (repair + re-serialize)
 * - `{ questions: [...] }`-style object wrappers for array schemas
 *   (top-level single-key object whose value is an array → use the array)
 * Returns null when the call is unrecoverable (SDK falls back to its own
 * error part).
 */
export async function repairToolCall({
	toolCall,
	error,
}: {
	toolCall: V4ToolCall;
	error: NoSuchToolError | InvalidToolInputError;
	tools: ToolSet;
	messages: unknown;
	instructions: unknown;
	inputSchema: (options: { toolName: string }) => PromiseLike<unknown>;
}): Promise<V4ToolCall | null> {
	if (NoSuchToolError.isInstance(error)) return null;

	const raw = typeof toolCall.input === "string" ? toolCall.input : "";
	const parsed = repairJsonText(raw);
	if (parsed === undefined) return null;

	// Unwrap single-key object wrappers: if the schema expects an array and
	// the model sent { questions: [...] } / { items: [...] } / { input: ... }.
	let candidate: unknown = parsed;
	if (
		parsed != null &&
		typeof parsed === "object" &&
		!Array.isArray(parsed) &&
		Object.keys(parsed as Record<string, unknown>).length === 1
	) {
		const [onlyValue] = Object.values(parsed as Record<string, unknown>);
		if (Array.isArray(onlyValue)) {
			candidate = onlyValue;
		}
	}

	return {
		...toolCall,
		input: JSON.stringify(candidate),
	} as V4ToolCall;
}
