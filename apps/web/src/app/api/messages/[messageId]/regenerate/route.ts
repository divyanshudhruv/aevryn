import { createUIMessageStreamResponse, convertToModelMessages, streamText, toUIMessageStream, type Tool, type ToolSet, type UIMessage } from "ai";
import { createGroq } from "@ai-sdk/groq";

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
	type ChatToolActivity,
	type ChatToolServices,
} from "@aevryn/agent";
import {
	KeyService,
	MemoryService,
	PlanService,
	QueueService,
	RunService,
	ThreadService,
	WorkflowService,
} from "@aevryn/workflow";

import { createServerSupabaseForNext } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadService = new ThreadService();
const keyService = new KeyService();
const planService = new PlanService();
const runService = new RunService();
const memoryService = new MemoryService();
const workflowService = new WorkflowService();
const queueService = new QueueService();

function jsonError(status: number, code: string, message: string): Response {
	return Response.json(
		{ data: null, error: { code, message, details: null }, meta: {} },
		{ status, headers: { "cache-control": "no-store" } },
	);
}

/**
 * Message-level regenerate: re-stream a fresh answer for an existing assistant
 * message, rewriting that row in place. Uses the same live-tooling path as
 * /api/chat (`createChatTools`, system prompt, tool-activity rows) against the
 * history that preceded the message, keeping the message id stable so the UI
 * can animate the replacement.
 */
export async function POST(
	_request: Request,
	ctx: { params: Promise<{ messageId: string }> },
): Promise<Response> {
	const supabase = await createServerSupabaseForNext();
	let user: { id: string };
	try {
		user = await requireUser(supabase);
	} catch {
		return jsonError(401, "UNAUTHENTICATED", "Sign in first.");
	}
	const { messageId } = await ctx.params;

	const message = await queueService.findById(messageId);
	if (!message) {
		return jsonError(404, "MESSAGE_NOT_FOUND", "Message does not exist.");
	}
	if (message.role !== "assistant") {
		return jsonError(400, "NOT_ASSISTANT", "Only assistant messages can be regenerated.");
	}
	const thread = await threadService.findById(message.threadId);
	if (!thread) {
		return jsonError(404, "THREAD_NOT_FOUND", "Thread does not exist.");
	}
	if (thread.userId !== user.id) {
		return jsonError(403, "FORBIDDEN", "You do not have access to this message.");
	}
	if (message.status === "streaming") {
		return jsonError(409, "ALREADY_STREAMING", "This message is already streaming.");
	}
	if (await queueService.hasActiveRun(thread.id)) {
		return jsonError(409, "RUN_ACTIVE", "Stop the running item before regenerating.");
	}

	const messages = await threadService.listMessagesByThread(thread.id);
	const index = messages.findIndex((row) => row.id === messageId);
	const prior = messages.slice(0, index);
	if (index < 0 || prior.length === 0) {
		return jsonError(400, "NOTHING_TO_REGENERATE", "No prior context to regenerate from.");
	}
	const history = buildUIMessages(prior);

	const turnRun = await runService.create({
		threadId: thread.id,
		userId: user.id,
		trigger: "rerun",
		rerunOf: message.runId ?? undefined,
	});
	await runService.setStatus(turnRun.id, "running");
	await threadService.updateMessage(messageId, {
		status: "streaming",
		content: [],
		runId: turnRun.id,
	});

	let workflowAutoApprove = false;
	if (thread.boundWorkflowId) {
		const wf = await workflowService.findById(thread.boundWorkflowId);
		workflowAutoApprove = wf?.autoApprove ?? false;
	}

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
		workspaceId: thread.workspaceId,
		threadId: thread.id,
		workflowId: thread.boundWorkflowId ?? undefined,
		autoApprove: workflowAutoApprove,
		services,
		onToolActivity,
		async onDelegateWork({ objective, instructions }) {
			const run = await runService.create({
				threadId: thread.id,
				userId: user.id,
				trigger: "message",
				promptSnapshot: objective,
			});
			const prompt = [objective, instructions].filter(Boolean).join("\n\n");
			await inngest.send({
				name: threadRunEvent,
				data: { runId: run.id, threadId: thread.id, prompt },
			});
			return { runId: run.id };
		},
	});

	let modelName = env.GROQ_MODEL;
	try {
		const workspaceKey = await keyService.getWorkspaceKey(
			thread.workspaceId,
			"groq",
		);
		modelName = workspaceKey?.modelName ?? modelName;
	} catch {
		// Fall back to the default model when the vault key cannot be read.
	}

	const resolved = await keyService.resolveKey(
		thread.workspaceId,
		user.id,
		"groq",
	);
	if (resolved.key === null) {
		await threadService.updateMessage(messageId, {
			status: "failed",
			content: [
				{
					type: "text",
					text: "Regeneration failed: no Groq key configured for this workspace.",
				},
			],
		});
		await runService.setStatus(turnRun.id, "failed");
		return jsonError(503, "NO_GROQ_KEY", "No Groq key configured for this workspace.");
	}

	const result = streamText({
		model: createGroq({ apiKey: resolved.key }).languageModel(modelName),
		system: buildChatSystemPrompt({
			workflowId: thread.boundWorkflowId ?? undefined,
			autoApprove: workflowAutoApprove,
			maxOutputTokens: 4096,
			modelName,
		}),
		messages: await convertToModelMessages(history, {
			tools: tools as ToolSet,
			ignoreIncompleteToolCalls: true,
		}),
		tools,
		maxOutputTokens: 4096,
	});

	void persistAssistantMessage(result, messageId, turnRun.id);

	return createUIMessageStreamResponse({
		status: 200,
		stream: toUIMessageStream({
			stream: result.stream,
			tools,
		}),
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
					? [{ type: "text", text: `Regeneration failed: ${error.message}` }]
					: [],
		});
		await runService.setStatus(runId, "failed");
	}
}