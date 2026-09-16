import type { Db, Message, RunStatus, Step, StepToolCall, Workflow } from "@aevryn/db";
import { db, ids, messages, planSteps, steps, threads, toolCallLogs, workflows } from "@aevryn/db";
import type { ToolCallLogInput } from "@aevryn/db";
import { and, asc, eq } from "drizzle-orm";

export class ChatService {
	constructor(private readonly client: Db = db) {}

	// ─── Workflow / plan steps ────────────────────────────────────────────────

		async createWorkflowFromPlan(input: {
		userId: string;
		threadId: string;
		title: string;
		objective: string;
		summary?: string;
		steps: Array<{ title: string; description?: string }>;
	}): Promise<Workflow> {
		const workflowId = ids.workflow();

		await this.client.insert(workflows).values({
			id: workflowId,
			threadId: input.threadId,
			userId: input.userId,
			workspaceId: await this.workspaceIdOf(input.threadId),
			title: input.title,
			objective: input.objective,
			status: "idle",
		});

		if (input.steps.length > 0) {
			await this.client.insert(planSteps).values(
				input.steps.map((step, index) => ({
					id: ids.planStep(),
					workflowId,
					userId: input.userId,
					position: index + 1, // 1-based, matches updateStepStatus
					title: step.title,
					description: step.description ?? null,
					status: "idle" as const,
				})),
			);
		}

		await this.client
			.update(threads)
			.set({ boundWorkflowId: workflowId })
			.where(eq(threads.id, input.threadId));

		const [row] = await this.client
			.select()
			.from(workflows)
			.where(eq(workflows.id, workflowId));
		return row!;
	}

	async updatePlanStepStatus(input: {
		workflowId: string;
		position: number;
		status: RunStatus;
		note?: string;
	}): Promise<void> {
		await this.client
			.update(planSteps)
			.set({
				status: input.status,
				...(input.note ? { description: input.note } : {}),
			})
			.where(
				and(
					eq(planSteps.workflowId, input.workflowId),
					eq(planSteps.position, input.position),
				),
			);

		if (input.status === "completed") {
			const stepRows = await this.client
				.select({ status: planSteps.status })
				.from(planSteps)
				.where(eq(planSteps.workflowId, input.workflowId));
			const allDone =
				stepRows.length > 0 && stepRows.every((s) => s.status === "completed");
			if (allDone) {
				await this.setWorkflowStatus({
					workflowId: input.workflowId,
					status: "completed",
				});
			}
		}
	}

	async setWorkflowStatus(input: {
		workflowId: string;
		status: RunStatus;
	}): Promise<void> {
		await this.client
			.update(workflows)
			.set({ status: input.status })
			.where(eq(workflows.id, input.workflowId));
	}

	async setThreadStatus(input: {
		threadId: string;
		status: RunStatus;
	}): Promise<void> {
		await this.client
			.update(threads)
			.set({ status: input.status })
			.where(eq(threads.id, input.threadId));
	}

		async boundWorkflow(threadId: string): Promise<Workflow | null> {
		const [row] = await this.client
			.select()
			.from(workflows)
			.where(eq(workflows.threadId, threadId))
			.orderBy(asc(workflows.createdAt));
		return row ?? null;
	}

	// ─── Messages + steps ─────────────────────────────────────────────────────

	async saveMessage(input: {
		userId: string;
		threadId: string;
		role: "user" | "assistant" | "system";
		content: string;
		/** Full UIMessage parts — persisted so replay restores tool cards,
		 *  QuestionFlow answers, plan decisions, and approvals exactly. */
		parts?: unknown[];
		usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
		steps?: Array<{
			position: number;
			text?: string;
			toolCalls: StepToolCall[];
		}>;
	}): Promise<Message> {
		const messageId = ids.message();

		await this.client.insert(messages).values({
			id: messageId,
			threadId: input.threadId,
			userId: input.userId,
			role: input.role,
			content: input.content,
			...(input.parts ? { parts: input.parts } : {}),
			usage: input.usage,
		});

		await this.client
			.update(threads)
			.set({ lastMessageAt: new Date() })
			.where(eq(threads.id, input.threadId));

		if (input.steps && input.steps.length > 0) {
			const insertedSteps = await this.client
				.insert(steps)
				.values(
					input.steps.map((step) => ({
						id: ids.step(),
						messageId,
						threadId: input.threadId,
						userId: input.userId,
						position: step.position,
						text: step.text ?? null,
						toolCalls: step.toolCalls,
					})),
				)
				.returning();

			// One audit-log row per server tool call, keyed off the inserted
			// step rows (real step ids, not the input positions).
			const logRows: ToolCallLogInput[] = [];
			for (let stepIndex = 0; stepIndex < insertedSteps.length; stepIndex++) {
				const stepRow = insertedSteps[stepIndex];
				const step = input.steps[stepIndex];
				if (!stepRow || !step) continue;
				for (const call of step.toolCalls ?? []) {
					logRows.push({
						id: ids.toolCallLog(),
						messageId,
						threadId: input.threadId,
						stepId: stepRow.id,
						userId: input.userId,
						toolName: call.toolName,
						toolCallId: call.toolCallId,
						direction: "server",
						input: call.input ?? null,
						output: call.output ?? null,
						error: call.error ?? null,
						status: call.status ?? "completed",
						startedAt: call.startedAt ? new Date(call.startedAt) : new Date(),
						endedAt: call.endedAt ? new Date(call.endedAt) : null,
						durationMs:
							call.startedAt && call.endedAt
								? new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()
								: null,
						tokens: input.usage ?? null,
						chainStack: null,
					});
				}
			}
			if (logRows.length > 0) {
				await this.client.insert(toolCallLogs).values(logRows);
			}
		}

		const [row] = await this.client
			.select()
			.from(messages)
			.where(eq(messages.id, messageId));
		return row!;
	}

		// Client-tool resumes (askUser answers, plan decisions, approvals) log the
	// answer on the wire back from the client. The message id is unknown at
	// that point, so it uses a sentinel; the (message_id, tool_call_id) unique
	// index still keys each tool call to one row. A follow-up can migrate the
	// sentinel rows to real message ids.
	async logClientToolCall(input: {
		threadId: string;
		userId: string;
		toolName: string;
		toolCallId: string;
		output: unknown;
	}): Promise<void> {
		await this.client.insert(toolCallLogs).values({
			id: ids.toolCallLog(),
			messageId: "",
			threadId: input.threadId,
			stepId: null,
			userId: input.userId,
			toolName: input.toolName,
			toolCallId: input.toolCallId,
			direction: "client",
			input: null,
			output: input.output ?? null,
			error: null,
			status: "completed",
			startedAt: new Date(),
			endedAt: new Date(),
			durationMs: 0,
			tokens: null,
			chainStack: null,
		});
	}

	async loadThread(input: {
		threadId: string;
		userId: string;
	}): Promise<{
		messages: Message[];
		stepsByMessageId: Record<string, Step[]>;
	}> {
		const messageRows = await this.client
			.select()
			.from(messages)
			.where(eq(messages.threadId, input.threadId))
			.orderBy(asc(messages.createdAt));

		const stepRows = await this.client
			.select()
			.from(steps)
			.where(eq(steps.threadId, input.threadId))
			.orderBy(asc(steps.position));

		const stepsByMessageId: Record<string, Step[]> = {};
		// Every message gets a key (empty array when no steps) so the timeline
		// renderer can rely on stepsByMessageId[messageId] always existing.
		for (const message of messageRows) {
			stepsByMessageId[message.id] = [];
		}
		for (const step of stepRows) {
			(stepsByMessageId[step.messageId] ??= []).push(step);
		}

		return { messages: messageRows, stepsByMessageId };
	}

	// ─── Internal ─────────────────────────────────────────────────────────────

	private async workspaceIdOf(threadId: string): Promise<string> {
		const [row] = await this.client
			.select({ workspaceId: threads.workspaceId })
			.from(threads)
			.where(eq(threads.id, threadId));
		if (!row) throw new Error(`Thread ${threadId} not found`);
		return row.workspaceId;
	}
}

export const chatService = new ChatService();
