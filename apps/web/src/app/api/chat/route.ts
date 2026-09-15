import type { UIMessage } from "ai";
import { requireUser } from "@aevryn/auth";
import { AgentService, ChatService, loadThreadMessages } from "@aevryn/workflow";
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

const chatBodySchema = z.object({
	threadId: z.string().min(1),
	workspaceId: z.string().min(1),
	mode: z.enum(["chat", "run"]).default("chat"),
	message: z.string().optional(),
	// DefaultChatTransport sends the conversation as UIMessages; the last
	// user message carries the new text.
	messages: z
		.array(
			z.object({
				id: z.string().optional(),
				role: z.string(),
				parts: z.array(z.unknown()),
			}),
		)
		.optional(),
	// Resume from an askUser/presentPlan client-tool answer.
	toolAnswer: z
		.object({
			toolCallId: z.string().min(1),
			toolName: z.string().min(1),
			answer: z.unknown(),
		})
		.optional(),
	// Resume from a native tool-approval response (wireAction etc.).
	approval: z
		.object({
			toolCallId: z.string().min(1),
			approved: z.boolean(),
			reason: z.string().optional(),
		})
		.optional(),
	model: z
		.object({
			providerSlug: z.string().min(1).optional(),
			modelId: z.string().min(1).optional(),
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
		return jsonError(400, "BAD_REQUEST", `Invalid request body: ${err instanceof Error ? err.message : String(err)}`);
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
	const message = body.message ?? (isResume ? undefined : extractNewUserText(clientMessages));

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
		// on the last assistant message.
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

		// Plan decision approve/bind: persist the workflow + plan steps and bind
		// it to the thread BEFORE the resumed loop runs. The plan's original
		// presentPlan input lives on the pending tool part of the last message.
		const decision =
			body.toolAnswer.toolName === "presentPlan" &&
			body.toolAnswer.answer != null &&
			typeof body.toolAnswer.answer === "object"
				? (body.toolAnswer.answer as { decision?: string }).decision
				: undefined;
		if (decision === "approved" || decision === "bound") {
			// The original pending presentPlan part (with the plan in `input`)
			// lives on an earlier assistant message; find it by toolCallId.
			const pendingPart = uiMessages
				.flatMap((m) => m.parts as unknown as Array<Record<string, unknown>>)
				.find(
					(p) =>
						p.type === "tool-presentPlan" &&
						p.toolCallId === body.toolAnswer!.toolCallId &&
						typeof p.input === "object" &&
						p.input !== null,
				);
			const rawPlan = pendingPart?.input as Record<string, unknown> | undefined;
			if (
				rawPlan &&
				typeof rawPlan.title === "string" &&
				typeof rawPlan.objective === "string" &&
				Array.isArray(rawPlan.steps)
			) {
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
					// workflow id (run mode uses it for updateStepStatus).
					const answerRecord = last!.parts.at(-1) as {
						output?: Record<string, unknown>;
					};
					if (answerRecord?.output && typeof answerRecord.output === "object") {
						answerRecord.output.workflowId = workflow.id;
					}
				} catch (err) {
					console.error("[api/chat] createWorkflowFromPlan failed", err);
				}
			}
		}
	}

	if (body.approval) {
		// Native tool-approval resume: the SDK validates the signed approval.
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
		if (code === "NO_PROVIDER") {
			return jsonError(
				409,
				"NO_PROVIDER",
				err instanceof Error ? err.message : "No model provider configured.",
			);
		}
		if (code === "NO_MODEL") {
			return jsonError(
				409,
				"NO_MODEL",
				err instanceof Error ? err.message : "Provider has no models.",
			);
		}
		console.error("[api/chat] streaming failed", err);
		return jsonError(500, "INTERNAL_SERVER_ERROR", "Agent turn failed.");
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
 * message list with the tool output merged in. Persist each changed tool
 * part back onto its message row so replay keeps the answers, and return
 * the client list (sanitized) for the model loop.
 */
async function syncThreadMessages(
	threadId: string,
	userId: string,
	clientMessages: Array<{ id?: string; role: string; parts: unknown[] }>,
): Promise<UIMessage[]> {
	const { db, messages: messagesTable } = await import("@aevryn/db");
	const { and, eq } = await import("drizzle-orm");

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

	// Write each message's parts back (only rows that exist for this user).
	await Promise.all(
		sanitized.map((m) => {
			if (m.id.startsWith("local_")) return Promise.resolve();
			return db
				.update(messagesTable)
				.set({ parts: m.parts as unknown[] })
				.where(
					and(
						eq(messagesTable.id, m.id),
						eq(messagesTable.userId, userId),
						eq(messagesTable.threadId, threadId),
					),
				);
		}),
	);

	return sanitized;
}
