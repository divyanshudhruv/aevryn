import { requireUser } from "@aevryn/auth";
import { db, messages, threads } from "@aevryn/db";
import {
	AgentService,
	ChatService,
	loadThreadMessages,
} from "@aevryn/workflow";
import type { UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const agentService = new AgentService();
const chatService = new ChatService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

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
	message: z.string().max(100_000).optional(),
	// DefaultChatTransport sends the conversation as UIMessages; the last
	// user message carries the new text.
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
});

export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}

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
		: await loadThreadMessages(body.threadId, user.id);

	// Extract the new user text from the transport payload (useChat sends the
	// full UIMessage list; the last user message is the new one).
	const message =
		body.message ?? (isResume ? undefined : extractNewUserText(clientMessages));

	if (message != null && message.trim().length > 0) {
		// New user message: persist it (parts included) and append.
		const userParts = [{ type: "text", text: message }];
		await chatService.saveMessage({
			userId: user.id,
			threadId: body.threadId,
			role: "user",
			content: message,
			parts: userParts,
		});
		uiMessages.push({
			id: `local_${Date.now()}`,
			role: "user",
			parts: userParts,
		} as never);
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
			(last as never as { parts: unknown[] }).parts.push({
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
	// messages array by useChat's auto-resume (the normal path). Handle both:
	// find the answered presentPlan part anywhere in the synced message list
	// that has not been bound yet.
	const presentPlanAnswers = uiMessages
		.flatMap((m) => m.parts as unknown as Array<Record<string, unknown>>)
		.filter(
			(p) =>
				p.type === "tool-presentPlan" &&
				p.state === "output-available" &&
				p.output != null &&
				typeof p.output === "object",
		)
		.map((p) => ({
			toolCallId: p.toolCallId as string | undefined,
			output: p.output as Record<string, unknown>,
			input: p.input as Record<string, unknown> | undefined,
		}));
	const unboundDecision = presentPlanAnswers.find(
		(a) =>
			(a.output.decision === "approved" || a.output.decision === "bound") &&
			a.output.workflowId == null,
	);
	if (unboundDecision) {
		// Authoritative idempotency: if this thread already has a bound
		// workflow, the decision was processed on an earlier resume — skip.
		const [threadRow] = await db
			.select({ boundWorkflowId: threads.boundWorkflowId })
			.from(threads)
			.where(and(eq(threads.id, body.threadId), eq(threads.userId, user.id)));
		if (threadRow?.boundWorkflowId) {
			unboundDecision.output.workflowId = threadRow.boundWorkflowId;
			return await agentService.respond({
				userId: user.id,
				workspaceId: body.workspaceId,
				threadId: body.threadId,
				uiMessages,
				mode: body.mode,
				modelOverride: body.model,
			});
		}
		const rawPlan = unboundDecision.input;
		if (
			rawPlan &&
			typeof rawPlan.title === "string" &&
			typeof rawPlan.objective === "string" &&
			Array.isArray(rawPlan.steps)
		) {
			// Idempotency guard: a previous approved/bound answer may already
			// have created a workflow for this thread + plan title.
			try {
				const workflow = await chatService.createWorkflowFromPlan({
					userId: user.id,
					threadId: body.threadId,
					title: rawPlan.title,
					objective: rawPlan.objective,
					...(typeof rawPlan.summary === "string"
						? { summary: rawPlan.summary }
						: {}),
					steps: rawPlan.steps as Array<{
						title: string;
						description?: string;
					}>,
				});
				// Reflect the binding on the decision so the agent knows the
				// workflow id (run mode uses it for updateStepStatus), and on the
				// client message parts so syncThreadMessages persists it — no
				// double-bind on the next resume.
				unboundDecision.output.workflowId = workflow.id;
				for (const m of uiMessages) {
					for (const p of m.parts as unknown as Array<
						Record<string, unknown>
					>) {
						if (
							p.type === "tool-presentPlan" &&
							p.toolCallId === unboundDecision.toolCallId &&
							p.output != null &&
							typeof p.output === "object"
						) {
							(p.output as Record<string, unknown>).workflowId = workflow.id;
						}
					}
				}
			} catch (err) {
				console.error("[api/chat] createWorkflowFromPlan failed", err);
				return jsonError(
					500,
					"WORKFLOW_BIND_FAILED",
					"Could not bind the approved plan to this thread. Please try again.",
				);
			}
		}
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
			(last as never as { parts: unknown[] }).parts.push({
				type: "tool-approval-response" as never,
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
			},
			{ headers: { "cache-control": "no-store" } },
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
		await persistFailedTurn({
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

// ─── GET: load a thread for replay ───────────────────────────────────────────

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

async function persistFailedTurn(opts: {
	threadId: string;
	userId: string;
	text: string;
}): Promise<void> {
	try {
		await chatService.saveMessage({
			userId: opts.userId,
			threadId: opts.threadId,
			role: "system",
			content: opts.text,
			parts: [{ type: "system-message", variant: "error", text: opts.text }],
		});
		await chatService.setThreadStatus({
			threadId: opts.threadId,
			status: "failed",
		});
	} catch (persistErr) {
		console.error("[api/chat] failed-turn persistence error", persistErr);
	}
}

/** Text of the newest user message in the transport payload. */
function extractNewUserText(
	messages: Array<{ role: string; parts: unknown[] }>,
): string | undefined {
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	if (!lastUser) return undefined;
	const text = lastUser.parts
		.map((p) => p as { type?: string; text?: string })
		.filter((p) => p.type === "text")
		.map((p) => p.text ?? "")
		.join("\n");
	return text.trim().length > 0 ? text : undefined;
}

/**
 * On resume (tool answer / approval), the client sends the authoritative
 * message list with the tool output merged in. We return that list (sanitized)
 * for the model loop, but we only persist it selectively: assistant rows are
 * owned by the stream (saveMessage persists them server-side at stream end),
 * and persisting transport snapshots back would overwrite the merged tool
 * parts with stale client copies. The only rows we write here are genuinely
 * new user text messages that were never persisted (defensive — normally the
 * POST handler persists the new user turn itself).
 */
async function syncThreadMessages(
	threadId: string,
	userId: string,
	clientMessages: Array<{ id?: string; role: string; parts: unknown[] }>,
): Promise<UIMessage[]> {
	const sanitized = clientMessages.map(
		(m): UIMessage => ({
			id: m.id ?? `local_${Date.now()}`,
			role: m.role as UIMessage["role"],
			parts: (m.parts as unknown[]).filter((p) => {
				const type = (p as { type?: string }).type;
				return type !== "reasoning" && type !== "reasoning-file";
			}) as UIMessage["parts"],
		}),
	);

	// Persist only a never-before-seen user text turn. Skip messages we can
	// identify as already-persisted (real message ids) and id-less local rows
	// that only carry tool answers.
	for (const m of sanitized) {
		if (m.role !== "user") continue;
		if (m.id.startsWith("msg_") || m.id.startsWith("local_")) continue;
		const text = (m.parts as Array<{ type?: string; text?: string }>)
			.filter((p) => p.type === "text" && typeof p.text === "string")
			.map((p) => p.text as string)
			.join("\n")
			.trim();
		if (!text) continue;

		const [existing] = await db
			.select({ id: messages.id })
			.from(messages)
			.where(
				and(
					eq(messages.threadId, threadId),
					eq(messages.userId, userId),
					eq(messages.id, m.id),
				),
			)
			.limit(1);
		if (existing) continue;

		await chatService.saveMessage({
			userId,
			threadId,
			role: "user",
			content: text,
			parts: m.parts as unknown[],
		});
	}

	return sanitized;
}
