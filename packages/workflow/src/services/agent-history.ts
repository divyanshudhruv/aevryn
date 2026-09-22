import { buildSystemPrompt } from "@aevryn/agent";
import type { Workflow } from "@aevryn/db";
import { db } from "@aevryn/db";
import { type UIMessage, validateUIMessages } from "ai";

import { ChatService } from "./chat-service";

export const MODEL_HISTORY_WINDOW = 8;

const CLIENT_TOOL_PART_PREFIXES = ["tool-askUser", "tool-presentPlan"];

function isKeptThroughPruning(part: unknown): boolean {
	const type = (part as { type?: string } | null)?.type ?? "";
	return (
		type === "text" ||
		CLIENT_TOOL_PART_PREFIXES.some((prefix) => type.startsWith(prefix))
	);
}

export function pruneModelHistory(uiMessages: UIMessage[]): UIMessage[] {
	const tail = uiMessages.slice(-MODEL_HISTORY_WINDOW);
	return tail.map((message, i) => {
		if (i === tail.length - 1) {
			return message;
		}
		const { parts, ...rest } = message;
		return {
			...rest,
			parts: parts.filter((p) => isKeptThroughPruning(p)),
		} as UIMessage;
	});
}

export function buildInstructions(
	input: { mode: "chat" | "run" },
	boundWorkflow?: Workflow | null,
	retryAfterFailure = false,
): string {
	let plan: string | undefined;
	if (boundWorkflow) {
		plan = `${boundWorkflow.objective ? `Objective: ${boundWorkflow.objective}\n` : ""}(Step statuses live in plan_steps — use updateStepStatus.)`;
	}

	const failureGuidance = retryAfterFailure
		? `

## Recovering from a failed run
A previous turn failed mid-stream. Do NOT restart earlier steps: re-run only the failed step with retryAgent (describe the step and the error), then continue the plan from where it stopped.`
		: "";

	const prompt = buildSystemPrompt({
		mode: input.mode,
		plan,
	});
	const taskGuidance =
		"\n\n## Step cards\n" +
		`When you move to a DISTINCT subtask, call beginTask(label) first — a short imperative label like "Searching flights". ` +
		"Group the tool calls of the SAME task together between beginTask calls. " +
		`If the user explicitly ordered steps ("first X, then Y"), emit one beginTask per ordered step, in order.`;
	return failureGuidance ? prompt + failureGuidance : prompt + taskGuidance;
}

export async function loadThreadMessages(
	threadId: string,
	userId: string,
	lastN?: number,
): Promise<UIMessage[]> {
	const chatService = new ChatService(db);
	const { messages: messageRows } = await chatService.loadThread({
		threadId,
		userId,
		limit: lastN,
	});

	const uiMessages = messageRows.map((row) => ({
		id: row.id,
		role: row.role,
		...(row.usage != null || row.createdAt != null
			? {
					metadata: {
						...(row.usage != null ? { usage: row.usage } : {}),
						...(row.createdAt != null
							? { createdAt: row.createdAt.toISOString() }
							: {}),
					},
				}
			: {}),
		parts: (Array.isArray(row.parts) && row.parts.length > 0
			? (row.parts as { type?: string }[])
			: [{ type: "text" as const, text: row.content }]
		).filter(
			(p) =>
				(p as { type?: string }).type !== "reasoning" &&
				(p as { type?: string }).type !== "reasoning-file",
		),
	}));

	try {
		return await validateUIMessages({ messages: uiMessages });
	} catch {
		return uiMessages as UIMessage[];
	}
}
