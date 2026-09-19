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
// Streaming turns with interleaved tool loops can run past the 10s default
// (5-turn agent runs hang on the model between steps). Vercel hard-caps at
// the plan's maxHandlerDuration, but declaring it prevents the default 10s.
export const maxDuration = 300;

const agentService = new AgentService();
const chatService = new ChatService();

// ─── POST: stream a turn ─────────────────────────────────────────────────────

// Per-part validation + caps. Intentionally tolerant of SDK part shape
// variants (no enforced enum on `state` — too many branches to close), but
// every string is bounded so an oversized body fails loudly at parse time.
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

// `presentPlan` answers are a decision object; `askUser` answers are a record
// of questionId → answer. Both are legal resume payloads.
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
	// DefaultChatTransport sends the conversation as UIMessages; the last
	// user message carries the new text (single extraction path — there is
	// deliberately no separate `message` string field).
	messages: z.array(clientMessageSchema).max(200).optional(),
	// Resume from an askUser/presentPlan client-tool answer.
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
	// Resume from a native tool-approval response (wireAction etc.).
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
	// Composer thinking-effort level (session-only, not persisted). Mapped to
	// providerOptions.reasoningEffort; models without reasoning ignore it.
	thinkingEffort: z.enum(["low", "medium", "high", "ultra", "god"]).optional(),
});

// Slider label → reasoning-effort string sent as providerOptions. God/ultra
// map to "max"/"high"; models that only accept low/medium/high ignore
// unsupported values (most providers fall back to their default).
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

	// Determine whether this is a RESUME (client tool answer / approval):
	// useChat sends the full messages array with the tool output merged in.
	const clientMessages = body.messages ?? [];
	const lastClientPart = clientMessages.at(-1)?.parts.at(-1) as
		| { type?: string; state?: string }
		| undefined;
	const isResume =
		body.toolAnswer != null ||
		body.approval != null ||
		(lastClientPart?.type?.startsWith("tool-") === true &&
			lastClientPart.state === "output-available");

	// Build the UIMessage list for this turn. On resume, trust the client's
	// messages — the DB still has the tool call PENDING, so rebuilding from
	// it would drop the answer and the provider would reject the request.
	// On a fresh send, rebuild from the DB (source of truth).
	const uiMessages = isResume
		? await syncThreadMessages(body.threadId, user.id, clientMessages)
		: // Fresh send: replay only the recent history window (the model prompt
			// is pruned to MODEL_HISTORY_WINDOW anyway) so long threads don't
			// ship hundreds of replay parts on every turn.
			await loadThreadMessages(body.threadId, user.id, MODEL_HISTORY_WINDOW);

	// Single extraction path: the last user message in the transport payload
	// IS the new turn on a fresh send (useChat appends it before submit). Its
	// client draft id rides along as the idempotency key — if this turn dies
	// before the server echo, the retry re-sends the same draft id and
	// saveMessage's (threadId, userId, clientMessageId) unique index dedups
	// it. On a RESUME the last user message is the ORIGINAL prompt (already
	// persisted and already present in the synced list) — which is why the
	// append below is fresh-send-only.
	const newTurn = extractNewUserMessage(clientMessages);
	const message = newTurn?.text;

	// Fresh sends only. Re-extracting + appending on a resume sent the model
	// the same user request TWICE at the tail of every card answer, which
	// read as "the user asked again" and made it re-answer the original
	// request instead of continuing from the answered card (the "I don't
	// have the tool call results" loop). syncClientMessages already put the
	// persisted copy in place, so a resume must not append anything.
	if (!isResume && message != null && message.trim().length > 0) {
		// New user message: persist it (parts included) and append.
		const userParts = [{ type: "text" as const, text: message }];
		await chatService.saveMessage({
			userId: user.id,
			threadId: body.threadId,
			role: "user",
			content: message,
			parts: userParts,
			clientMessageId: newTurn?.id,
		});
		// ChatGPT-style auto title is NOT fired here — it moved into
		// AgentService.finishTurn so it fires exactly once per completed turn
		// (guarded by turnPersisted) even on the client-abort path. The new
		// user text rides along as autoTitleMessage.
		uiMessages.push({
			id: `local_${Date.now()}`,
			role: "user",
			parts: userParts,
		} as UIMessage);
	}

	if (body.toolAnswer) {
		// Client-tool answer (askUser / presentPlan) flows back as a tool part
		// on the last assistant message. Log it on the audit rail first — the
		// message id is unknown here (sentinel row; see logClientToolCall).
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

	// Plan decision approve/bind: persist the workflow + plan steps and bind
	// it to the thread BEFORE the resumed loop runs. The decision arrives two
	// ways — as an explicit body.toolAnswer, or merged into the client's
	// messages array by useChat's auto-resume (the normal path). The service
	// finds the answered presentPlan part anywhere in the synced message list
	// and binds it idempotently (a thread with a bound workflow yields
	// `already-bound`; ownership is verified inside).
	try {
		const bindResult = await chatService.bindPlanDecision({
			userId: user.id,
			threadId: body.threadId,
			uiMessages,
		});
		if (bindResult.status !== "no-decision") {
			// Server-authoritative run mode: an "Approve" (run now) decision
			// executes THIS turn in run mode even if the client's transport
			// still says chat — the auto-resume races the client's realtime-
			// driven mode flip, and the chat-mode prompt forbids executing a
			// bound plan. "bound" (run later) resumes in the client's mode.
			const resumeMode =
				bindResult.status === "bound-approved" ? "run" : body.mode;
			// Authoritative idempotency: the decision was processed on an
			// earlier resume — the reflected workflowId is already on the
			// parts. Resume the loop immediately.
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
		// Persist an in-thread error tile so the failure survives refresh
		// (matches the streaming-failure path; never throws).
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
		// Native tool-approval resume: the SDK validates the signed approval.
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
			// Forwarding request.signal: a client Stop / tab close aborts the
			// stream server-side (model call + tools cancel; thread resets).
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
		// Mark the thread failed and persist an in-thread error tile so the
		// failure survives refresh (re-run triggers the retryAgent repair).
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAILED_TURN_GENERIC =
	'Something went wrong while streaming this turn. Re-run or reply "continue" to pick back up.';

/** Text + client draft id of the newest user message in the transport payload. */
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

/**
 * On resume (tool answer / approval), the client sends the authoritative
 * message list with the tool output merged in. We return that list (sanitized)
 * for the model loop. Persistence is selective (see ChatService.syncClientMessages):
 * only genuinely new user text turns that were never persisted get written — the
 * assistant rows belong to the stream, and transport snapshots would overwrite
 * merged tool parts with stale client copies.
 */
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
