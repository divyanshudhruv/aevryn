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

	// Build the UIMessage list for this turn.
	const uiMessages = await loadThreadMessages(body.threadId, user.id);

	if (body.message != null && body.message.trim().length > 0) {
		// New user message: persist it and append to the conversation.
		await chatService.saveMessage({
			userId: user.id,
			threadId: body.threadId,
			role: "user",
			content: body.message,
		});
		uiMessages.push({
			id: `local_${Date.now()}`,
			role: "user",
			parts: [{ type: "text", text: body.message }],
		});
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

	const { messages, stepsByMessageId } = await chatService.loadThread({
		threadId,
		userId: user.id,
	});

	return Response.json(
		{ data: { messages, stepsByMessageId }, error: null, meta: {} },
		{ headers: { "cache-control": "no-store" } },
	);
}
