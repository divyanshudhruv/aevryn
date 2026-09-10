import { groq } from "@ai-sdk/groq";
import { getSessionUser } from "@aevryn/auth";
import { env } from "@aevryn/env/server";
import { WorkflowService } from "@aevryn/workflow";
import {
	askUserQuestionSchema,
	finalizeWorkflowSchema,
	showPlanSchema,
} from "@aevryn/workflow/chat/ai-tools";
import { randomUUID } from "node:crypto";
import {
	createUIMessageStreamResponse,
	streamText,
	toUIMessageStream,
	tool,
} from "ai";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const workflowService = new WorkflowService();

const MODEL = groq(env.GROQ_MODEL);

const SYSTEM_PROMPT = `You are Aevryn, the planning agent. Help the user plan a piece of work.
You deliver a short plan and use your tools to ask for missing details and to record the final plan.

Rules:
- For each topic you need input on, call askUserQuestion ONCE per topic, then STOP and wait for the answer. Never ask two questions in the same turn.
- Compose askUserQuestion with concise multiple-choice options (2-5) plus allowOther for free-form.
- When you have enough to plan, present a concise plan as plain text.
- Only call finalizeAndInject when the user explicitly approves the plan (including a short confirmation).
- Do not invent constraints. Do not repeat questions the user already answered.`;

interface MessagePart {
	type: string;
	text?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
	const session = await getSessionUser(request);
	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}
	const userId = session.user.id;

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	const workflowId =
		typeof body.workflowId === "string" && body.workflowId.trim() !== ""
			? body.workflowId
			: null;
	if (!workflowId) {
		return new Response("Bad Request: workflowId required", { status: 400 });
	}

	const incoming = extractUserText(body);
	if (!incoming) {
		return new Response("Bad Request: message required", { status: 400 });
	}

	const [history, userStep] = await Promise.all([
		workflowService.getChatHistory(workflowId, userId),
		workflowService.appendChatStep(workflowId, userId, {
			role: "user",
			text: incoming,
		}),
	]);

	const askUserQuestion = tool({
		description:
			"Ask the user one short question that needs an answer before you can continue. Use it when the user's request is missing a needed detail or choice.",
		inputSchema: askUserQuestionSchema,
		execute: async (input) => {
			await workflowService.appendToolEvent(workflowId, userId, "askUserQuestion", input, {
				answered: null,
			});
			const question = input.question;
			return { question: { ...question, id: question.id ?? randomUUID() } };
		},
	});

	const showPlan = tool({
		description:
			"Record the draft plan on the workflow. The workflow stays draft until the user approves or edits it.",
		inputSchema: showPlanSchema,
		execute: async (input) => {
			const plan = {
				title: input.planTitle,
				objective: input.planTitle,
				summary: input.summary,
				steps: input.steps,
			};
			const saved = await workflowService.saveDraftPlan(workflowId, userId, plan);
			await workflowService.appendToolEvent(workflowId, userId, "showPlan", input, {
				planId: saved.planId,
			});
			return { planId: saved.planId };
		},
	});

	const finalizeAndInject = tool({
		description:
			"Persist the finalized plan on the workflow and iterate the thread state so it can be run. Only call after the user explicitly approved the plan.",
		inputSchema: finalizeWorkflowSchema,
		execute: async (input) => {
			await workflowService.saveDraftPlan(workflowId, userId, {
				title: input.title,
				objective: input.objective,
				summary: input.summary,
				steps: input.steps,
				notes: input.notes,
			});
			await workflowService.appendToolEvent(workflowId, userId, "finalizeAndInject", input, {
				ok: true,
				workflowId,
			});
			return { ok: true as const, workflowId };
		},
	});

	const tools = { askUserQuestion, showPlan, finalizeAndInject };

	const result = streamText({
		model: MODEL,
		system: SYSTEM_PROMPT,
		messages: [...history, { role: "user" as const, content: incoming }],
		tools,
		onFinish: async ({ text }) => {
			if (text.trim() === "") {
				return;
			}
			await workflowService.appendChatStep(workflowId, userId, {
				role: "assistant",
				text,
			});
		},
	});

	return createUIMessageStreamResponse({
		stream: toUIMessageStream({ stream: result.stream, tools }),
	});
}

function extractUserText(body: Record<string, unknown>): string | null {
	const messages = body.messages;
	if (Array.isArray(messages)) {
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			const message = messages[i] as { role?: string; parts?: MessagePart[] };
			if (message.role !== "user") {
				continue;
			}
			if (Array.isArray(message.parts)) {
				const text = message.parts
					.filter((part) => part.type === "text" && typeof part.text === "string")
					.map((part) => (part.text as string).trim())
					.filter((part) => part !== "")
					.join("\n");
				if (text.trim() !== "") {
					return text.trim();
				}
			}
		}
	}
	const fb = body.message;
	if (typeof fb === "string" && fb.trim() !== "") {
		return fb.trim();
	}
	return null;
}