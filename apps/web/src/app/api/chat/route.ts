import { requireUser } from "@aevryn/auth";
import {
	AgentService,
	ChatService,
	loadThreadMessages,
	MODEL_HISTORY_WINDOW,
} from "@aevryn/workflow";
import type { UIMessage } from "ai";
import { z } from "zod";

import { jsonError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const agentService = new AgentService();
const chatService = new ChatService();

const clientPartSchema = z.object({
	type: z.string().min(1).max(64),
	text: z.string().max(100_000).optional(),
	toolCallId: z.string().max(128).optional(),
	state: z.string().max(32).optional(),
	input: z.unknown().optional(),
	output: z.unknown().optional(),
});

const clientMessageSchema = z.object({
	id: z.string().max(128).optional(),
	role: z.string().min(1).max(32),
	parts: z.array(clientPartSchema).max(500),
});

const decisionAnswerSchema = z
	.object({
		decision: z
			.enum(["approved", "bound", "changes_requested", "declined"])
			.optional(),
		feedback: z.string().max(10_000).optional(),
		workflowId: z.string().max(128).optional(),
	})
	.partial();

const chatBodySchema = z.object({
	threadId: z.string().min(1).max(128),
	workspaceId: z.string().min(1).max(128),
	mode: z.enum(["chat", "run"]).default("chat"),
	messages: z.array(clientMessageSchema).max(200).optional(),
	toolAnswer: z
		.object({
			toolCallId: z.string().min(1).max(128),
			toolName: z.string().min(1).max(64),
			answer: z.union([
				decisionAnswerSchema,
				z.record(z.string(), z.unknown()),
			]),
		})
		.optional(),
	approval: z
		.object({
			toolCallId: z.string().min(1).max(128),
			approved: z.boolean(),
			reason: z.string().max(10_000).optional(),
		})
		.optional(),
	model: z
		.object({
			providerSlug: z.string().min(1).max(128).optional(),
			modelId: z.string().min(1).max(128).optional(),
		})
		.optional(),
	thinkingEffort: z.enum(["low", "medium", "high", "ultra", "god"]).optional(),
});

const THINKING_EFFORT_MAP: Record<string, string> = {
	low: "low",
	medium: "medium",
	high: "high",
	ultra: "high",
	god: "max",
};

export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const rateLimited = enforceRateLimit({
		key: `chat:${user.id}`,
		windowMs: 60_000,
		limit: 60,
	});
	if (rateLimited) return rateLimited;

	let body: z.infer<typeof chatBodySchema>;
	try {
		body = chatBodySchema.parse(await request.json());
	} catch (err) {
		return jsonError(
			400,
			"BAD_REQUEST",
			`Invalid request body: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	const clientMessages = body.messages ?? [];
	const lastClientPart = clientMessages.at(-1)?.parts.at(-1) as
		| { type?: string; state?: string }
		| undefined;
	const isResume =
		body.toolAnswer != null ||
		body.approval != null ||
		(lastClientPart?.type?.startsWith("tool-") === true &&
			lastClientPart.state === "output-available");

	const uiMessages = isResume
		? await syncThreadMessages(body.threadId, user.id, clientMessages)
		: await loadThreadMessages(body.threadId, user.id, MODEL_HISTORY_WINDOW);

	const newTurn = extractNewUserMessage(clientMessages);
	const message = newTurn?.text;

	if (!isResume && message != null && message.trim().length > 0) {
		const userParts = [{ type: "text" as const, text: message }];
		await chatService.saveMessage({
			userId: user.id,
			threadId: body.threadId,
			role: "user",
			content: message,
			parts: userParts,
			clientMessageId: newTurn?.id,
		});
		uiMessages.push({
			id: `local_${Date.now()}`,
			role: "user",
			parts: userParts,
		} as UIMessage);
	}

	if (body.toolAnswer) {
		await chatService.logClientToolCall({
			threadId: body.threadId,
			userId: user.id,
			toolName: body.toolAnswer.toolName,
			toolCallId: body.toolAnswer.toolCallId,
			output: body.toolAnswer.answer,
		});
		const last = uiMessages.at(-1);
		if (last) {
			(last as unknown as { parts: unknown[] }).parts.push({
				type: `tool-${body.toolAnswer.toolName}`,
				toolCallId: body.toolAnswer.toolCallId,
				state: "output-available",
				input: {},
				output: body.toolAnswer.answer,
			});
		}
	}

	try {
		const bindResult = await chatService.bindPlanDecision({
			userId: user.id,
			threadId: body.threadId,
			uiMessages,
		});
		if (bindResult.status !== "no-decision") {
			const resumeMode =
				bindResult.status === "bound-approved" ? "run" : body.mode;
			return await agentService.respond({
				userId: user.id,
				workspaceId: body.workspaceId,
				threadId: body.threadId,
				uiMessages,
				mode: resumeMode,
				modelOverride: body.model,
				autoTitleMessage: !isResume ? message : undefined,
			});
		}
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === "THREAD_NOT_FOUND") {
			return jsonError(
				404,
				"THREAD_NOT_FOUND",
				"A plan decision for a thread you don't own must never bind a workflow. Thread not found.",
			);
		}
		console.error("[api/chat] createWorkflowFromPlan failed", err);
		await chatService.persistFailedTurn({
			threadId: body.threadId,
			userId: user.id,
			text: "Could not bind the approved plan to this thread. Please try again.",
		});
		return jsonError(
			500,
			"WORKFLOW_BIND_FAILED",
			"Could not bind the approved plan to this thread. Please try again.",
		);
	}

	if (body.approval) {
		await chatService.logClientToolCall({
			threadId: body.threadId,
			userId: user.id,
			toolName: "approval",
			toolCallId: body.approval.toolCallId,
			output: {
				approved: body.approval.approved,
				reason: body.approval.reason,
			},
		});
		const last = uiMessages.at(-1);
		if (last) {
			(last as unknown as { parts: unknown[] }).parts.push({
				type: "tool-approval-response",
				toolCallId: body.approval.toolCallId,
				approved: body.approval.approved,
				...(body.approval.reason ? { reason: body.approval.reason } : {}),
			});
		}
	}

	try {
		return await agentService.respond(
			{
				userId: user.id,
				workspaceId: body.workspaceId,
				threadId: body.threadId,
				uiMessages,
				mode: body.mode,
				modelOverride: body.model,
				thinkingEffort: body.thinkingEffort
					? (THINKING_EFFORT_MAP[body.thinkingEffort] ?? undefined)
					: undefined,
				autoTitleMessage: !isResume ? message : undefined,
			},
			{ headers: { "cache-control": "no-store" }, signal: request.signal },
		);
	} catch (err) {
		const code = (err as { code?: string }).code;
		const failureText =
			code === "NO_PROVIDER" || code === "NO_MODEL"
				? err instanceof Error
					? err.message
					: "No model provider configured."
				: FAILED_TURN_GENERIC;
		await chatService.persistFailedTurn({
			threadId: body.threadId,
			userId: user.id,
			text: failureText,
		});
		if (code === "NO_PROVIDER") {
			return jsonError(409, "NO_PROVIDER", failureText);
		}
		if (code === "NO_MODEL") {
			return jsonError(409, "NO_MODEL", failureText);
		}
		console.error("[api/chat] streaming failed", err);
		return jsonError(500, "AGENT_ERROR", FAILED_TURN_GENERIC);
	}
}

export async function GET(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

	const url = new URL(request.url);
	const threadId = url.searchParams.get("threadId");
	if (!threadId) {
		return jsonError(400, "BAD_REQUEST", "threadId query param is required.");
	}

	try {
		const uiMessages = await loadThreadMessages(threadId, user.id);

		return Response.json(
			{ data: { messages: uiMessages }, error: null, meta: {} },
			{ headers: { "cache-control": "no-store" } },
		);
	} catch (err) {
		console.error("[api/chat] GET failed", err);
		return jsonError(500, "LOAD_FAILED", "Could not load thread.");
	}
}

const FAILED_TURN_GENERIC =
	'Something went wrong while streaming this turn. Re-run or reply "continue" to pick back up.';

function extractNewUserMessage(
	messages: Array<{ id?: string; role: string; parts: unknown[] }>,
): { id?: string; text: string } | undefined {
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	if (!lastUser) return undefined;
	const text = lastUser.parts
		.map((p) => p as { type?: string; text?: string })
		.filter((p) => p.type === "text")
		.map((p) => p.text ?? "")
		.join("\n");
	return text.trim().length > 0
		? { id: lastUser.id, text: text.trim() }
		: undefined;
}

async function syncThreadMessages(
	threadId: string,
	userId: string,
	clientMessages: Array<{ id?: string; role: string; parts: unknown[] }>,
): Promise<UIMessage[]> {
	return chatService.syncClientMessages({
		threadId,
		userId,
		clientMessages,
	});
}
