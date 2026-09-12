import { createUIMessageStreamResponse, convertToModelMessages, streamText, toUIMessageStream, type Tool, type ToolSet, type UIMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { z } from "zod";

import { chatMessages, db, ids } from "@aevryn/db";
import { requireUser } from "@aevryn/auth";
import { env } from "@aevryn/env/server";
import {
	inngest,
	threadRunEvent,
} from "@aevryn/inngest";
import {
	buildChatSystemPrompt,
	buildUIMessages,
	createChatTools,
	textUIMessage,
	type ChatToolActivity,
	type ChatToolServices,
} from "@aevryn/agent";
import {
	KeyService,
	MemberService,
	MemoryService,
	PlanService,
	RunService,
	ThreadService,
	WorkflowService,
} from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const memberService = new MemberService();
const keyService = new KeyService();
const planService = new PlanService();
const runService = new RunService();
const memoryService = new MemoryService();
const workflowService = new WorkflowService();

const chatBodySchema = z.object({
	threadId: z.string().min(1).optional(),
	workspaceId: z.string().min(1).optional(),
	message: z.string().min(1).max(20_000),
	autoApprove: z.boolean().optional(),
	maxOutputTokens: z.number().int().min(64).max(32_768).optional(),
});

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{
			status,
			headers: { "cache-control": "no-store" },
		},
	);
}

export async function POST(request: Request): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string; email?: string | null };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in to use chat.");
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = null;
	}
	const parsed = chatBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError(400, "INVALID_PAYLOAD", "A non-empty `message` is required.");
	}
	const { message, autoApprove: bodyAutoApprove, maxOutputTokens } = parsed.data;

	const members = await memberService.listByUser(user.id);

	let threadId = parsed.data.threadId;
	let workspaceId = parsed.data.workspaceId;

	if (threadId) {
		const thread = await threadService.findById(threadId);
		if (!thread) {
			return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
		}
		const canAccess =
			thread.userId === user.id ||
			members.some((m) => m.workspaceId === thread.workspaceId);
		if (!canAccess) {
			return jsonError(403, "FORBIDDEN", "You do not have access to this thread.");
		}
		workspaceId = thread.workspaceId;
	}

	if (!workspaceId) {
		const firstMember = members[0];
		if (!firstMember) {
			return jsonError(400, "NO_WORKSPACE", "Create or join a workspace first.");
		}
		workspaceId = firstMember.workspaceId;
	}
	if (!workspaceId) {
		return jsonError(400, "NO_WORKSPACE", "Create or join a workspace first.");
	}

	const resolved = await keyService.resolveKey(workspaceId, user.id, "groq");
	if (resolved.key === null) {
		return jsonError(503, "NO_GROQ_KEY", "No Groq key configured for this workspace.");
	}

	if (!threadId) {
		const thread = await threadService.create({
			workspaceId,
			userId: user.id,
			title: "",
		});
		threadId = thread.id;
	}
	if (!threadId) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}

	const thread = await threadService.findById(threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}

	let workflowAutoApprove = false;
	if (thread.boundWorkflowId) {
		const wf = await workflowService.findById(thread.boundWorkflowId);
		workflowAutoApprove = wf?.autoApprove ?? false;
	}
	const autoApprove = bodyAutoApprove ?? workflowAutoApprove;

	const assistantMessageId = ids.chatMessage();
	const userMessageId = ids.chatMessage();

	await db.insert(chatMessages).values({
		id: userMessageId,
		threadId,
		userId: user.id,
		role: "user",
		status: "completed",
		content: textUIMessage(message),
	});
	if (!thread.title) {
		await threadService.autoTitle(threadId, message);
	}
	await threadService.touchLastMessage(threadId);

	await db.insert(chatMessages).values({
		id: assistantMessageId,
		threadId,
		userId: user.id,
		role: "assistant",
		status: "streaming",
		content: [],
	});

	const turnRun = await runService.create({
		threadId,
		userId: user.id,
		trigger: "message",
	});
	await runService.setStatus(turnRun.id, "running");

	const history = buildUIMessages(await threadService.listMessagesByThread(threadId));

	const services: ChatToolServices = {
		plan: planService,
		run: runService,
		thread: threadService,
		memory: memoryService,
	};

	const onToolActivity = async (activity: ChatToolActivity): Promise<void> => {
		try {
			await runService.createActivity({
				runId: turnRun.id,
				type: "tool",
				status: activity.ok ? "complete" : "failed",
				stepLabel: `chat.${activity.tool}`,
				title: activity.tool,
				detail: {
					input: activity.input,
					output: activity.output ?? null,
					error: activity.error ?? null,
					durationMs: activity.durationMs ?? null,
				},
			});
		} catch {
			// Activity bookkeeping is best-effort.
		}
	};

	const tools: Record<string, Tool> = createChatTools({
		userId: user.id,
		workspaceId,
		threadId,
		workflowId: thread.boundWorkflowId ?? undefined,
		autoApprove,
		services,
		onToolActivity,
		async onDelegateWork({ objective, instructions }) {
			const run = await runService.create({
				threadId,
				userId: user.id,
				trigger: "message",
				promptSnapshot: objective,
			});
			const prompt = [objective, instructions].filter(Boolean).join("\n\n");
			await inngest.send({
				name: threadRunEvent,
				data: { runId: run.id, threadId, prompt },
			});
			return { runId: run.id };
		},
	});

	let modelName = env.GROQ_MODEL;
	try {
		const workspaceKey = await keyService.getWorkspaceKey(workspaceId, "groq");
		modelName = workspaceKey?.modelName ?? modelName;
	} catch {
		// Fall back to the default model when the vault key cannot be read.
	}

	const result = streamText({
		model: createGroq({ apiKey: resolved.key }).languageModel(modelName),
		system: buildChatSystemPrompt({
			workflowId: thread.boundWorkflowId ?? undefined,
			autoApprove,
			maxOutputTokens: maxOutputTokens ?? 4096,
			modelName,
		}),
		messages: await convertToModelMessages(history, {
			tools: tools as ToolSet,
			ignoreIncompleteToolCalls: true,
		}),
		tools,
		maxOutputTokens: maxOutputTokens ?? 4096,
	});

	void persistAssistantMessage(result, assistantMessageId, turnRun.id);

	const uiStream = toUIMessageStream({
		stream: result.stream,
		tools,
	});

	return createUIMessageStreamResponse({
		status: 200,
		stream: uiStream,
	});
}

async function persistAssistantMessage(
	result: Awaited<ReturnType<typeof streamText>>,
	messageId: string,
	runId: string,
): Promise<void> {
	try {
		const [text, toolResults] = await Promise.all([
			result.text,
			result.toolResults,
		]);
		const parts: UIMessage["parts"] = [];
		for (const call of toolResults) {
			parts.push({
				type: `tool-${call.toolName}`,
				toolCallId: call.toolCallId,
				input: call.input,
				output: call.output,
				state: "output-available",
				providerExecuted: true,
			} as unknown as UIMessage["parts"][number]);
		}
		if (text.length > 0) {
			parts.push({ type: "text", text });
		}
		await threadService.updateMessage(messageId, {
			status: "completed",
			content: parts,
		});
		await runService.setStatus(runId, "completed");
		const usage = await result.usage;
		await runService.recordUsage(runId, {
			tokenCount:
				usage.totalTokens ??
				(usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
			costUsd: "0",
		});
	} catch (error) {
		await threadService.updateMessage(messageId, {
			status: "failed",
			content:
				error instanceof Error
					? [{ type: "text", text: `Chat failed: ${error.message}` }]
					: [],
		});
		await runService.setStatus(runId, "failed");
	}
}