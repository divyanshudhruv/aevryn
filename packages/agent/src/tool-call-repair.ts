import type { LanguageModelV4ToolCall as V4ToolCall } from "@ai-sdk/provider";
import { type InvalidToolInputError, NoSuchToolError, type ToolSet } from "ai";

const REPAIRS: Array<(text: string) => string> = [
	(text) => text,
	(text) => text.replace(/,\s*([}\]])/g, "$1"),
	(text) =>
		text.replace(/[\u201c\u201d]/g, '"').replace(/[\u2018\u2019]/g, "'"),
	(text) => text.replace(/'([^'\\]*)'/g, '"$1"'),
	(text) =>
		text.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3'),
	(text) =>
		text
			.replace(/[\u201c\u201d]/g, '"')
			.replace(/[\u2018\u2019]/g, "'")
			.replace(/'([^'\\]*)'/g, '"$1"')
			.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
			.replace(/,\s*([}\]])/g, "$1"),
	function cutOff(text) {
		for (let end = text.length; end > 1; end--) {
			let candidate = text
				.slice(0, end)
				.replace(/,\s*$/, "")
				.replace(/,\s*([}\]])/g, "$1");
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
			} catch {}
		}
		return text;
	},
];

export function repairJsonText(text: string): unknown | undefined {
	for (const fix of REPAIRS) {
		try {
			return JSON.parse(fix(text));
		} catch {}
	}
	return undefined;
}

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
