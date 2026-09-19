import type { PlanInput } from "@aevryn/ui/components/ui/plan-approval-card";
import type { UIMessage } from "ai";

// Pure helpers for the conversation timeline: part→data decoders, turn
// splitting, and formatting. No React here — everything is unit-testable
// on its own.

export const CLIENT_TOOLS = new Set([
	"askUser",
	"presentPlan",
	"wireAction",
	"wireBuildRequest",
]);

export function questionsFromInput(input: unknown) {
	if (!Array.isArray(input)) return null;
	return input as Array<Record<string, unknown>>;
}

/** Real timestamp from persisted/stream metadata; falls back to now for
 *  brand-new live messages (their createdAt arrives on the finish event). */
export function messageTimestamp(message: UIMessage): string {
	const createdAt = (message.metadata as { createdAt?: string } | undefined)
		?.createdAt;
	const date = createdAt ? new Date(createdAt) : new Date();
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString(undefined, {
		weekday: "long",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** Human-facing copy for a completed askUser / presentPlan interaction. */
export function clientToolOutcomeRow(
	toolName: string,
	output: unknown,
): { message: string; className?: string } | null {
	if (output == null || typeof output !== "object") return null;
	const record = output as Record<string, unknown>;

	if (toolName === "askUser") {
		return { message: "Questions filled and submitted by the user" };
	}

	if (toolName === "presentPlan") {
		const decision = typeof record.decision === "string" ? record.decision : "";
		if (decision === "approved") {
			return {
				message: "Plan approved — executing now",
				className: "mb-[40px] mt-[20px]",
			};
		}
		if (decision === "bound") {
			return {
				message: "Plan approved and bound to this thread",
				className: "mb-[40px] mt-[20px]",
			};
		}
		if (decision === "changes_requested") {
			const feedback =
				typeof record.feedback === "string" && record.feedback.trim().length > 0
					? ` — “${record.feedback.trim()}”`
					: "";
			return {
				message: `Changes requested${feedback}`,
				className: "mb-[40px] mt-[20px]",
			};
		}
		if (decision === "declined") {
			return {
				message: "Plan declined — staying in chat",
				className: "mb-[40px] mt-[20px]",
			};
		}
	}

	return null;
}

export function planFromInput(input: unknown): PlanInput | null {
	if (input == null || typeof input !== "object") return null;
	const record = input as Record<string, unknown>;
	if (
		typeof record.title !== "string" ||
		typeof record.objective !== "string" ||
		!Array.isArray(record.steps)
	) {
		return null;
	}
	return {
		title: record.title,
		objective: record.objective,
		summary: typeof record.summary === "string" ? record.summary : undefined,
		steps: record.steps as PlanInput["steps"],
	};
}

export function isCompletedClientTool(
	part: UIMessage["parts"][number],
): boolean {
	if (!part.type.startsWith("tool-")) return false;
	if (!CLIENT_TOOLS.has(part.type.slice(5))) return false;
	return (part as { state?: string }).state === "output-available";
}

export interface MessageTurn {
	parts: UIMessage["parts"];
	offset: number;
}

/** One-line card header from narration text: first sentence, capped. */
export function truncateHeader(text: string): string {
	const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
	const clean = firstSentence
		.replace(/^(Okay|Alright|Now|So)[,:]\s*/i, "")
		.trim();
	return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

/** Split one assistant message into turns: a new turn starts right after
 *  every *completed* client-tool part (answered askUser/presentPlan, decided
 *  wire action). The answer's card closes its turn; whatever the agent
 *  streams next opens a fresh bubble — no more same-message grouping. */
export function splitIntoTurns(parts: UIMessage["parts"]): MessageTurn[] {
	if (parts.length === 0) return [{ parts, offset: 0 }];
	const turns: MessageTurn[] = [];
	let start = 0;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (!part) continue;
		if (isCompletedClientTool(part)) {
			if (i >= start) {
				turns.push({ parts: parts.slice(start, i + 1), offset: start });
			}
			start = i + 1;
		}
	}
	if (start < parts.length) {
		turns.push({ parts: parts.slice(start), offset: start });
	}
	return turns;
}
