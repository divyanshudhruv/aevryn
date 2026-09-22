import type {
	Db,
	Message,
	RunStatus,
	StepToolCall,
	ToolCallLogInput,
	Workflow,
} from "@aevryn/db";
import {
	db,
	ids,
	messages,
	planSteps,
	steps,
	threads,
	toolCallLogs,
	workflows,
} from "@aevryn/db";
import type { UIMessage } from "ai";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { WorkflowService } from "./workflow-service";

export type PlanBindResult =
	| { status: "no-decision" }
	| { status: "already-bound"; workflowId: string }
	| { status: "bound"; workflowId: string }
	| { status: "bound-approved"; workflowId: string };

export type RunControlResult =
	| { status: "stopped" }
	| { status: "ok" }
	| { status: "no-bound-workflow" }
	| { status: "already-running" };

export class ChatService {
	private readonly workflowSvc: WorkflowService;

	constructor(private readonly client: Db = db) {
		this.workflowSvc = new WorkflowService(this.client);
	}

	async updatePlanStepStatus(input: {
		userId: string;
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
					eq(planSteps.userId, input.userId),
				),
			);

		if (input.status === "completed") {
			const [counts] = await this.client
				.select({
					total: sql<number>`count(*)`.mapWith(Number),
					pending:
						sql<number>`count(*) filter (where status <> 'completed')`.mapWith(
							Number,
						),
				})
				.from(planSteps)
				.where(
					and(
						eq(planSteps.workflowId, input.workflowId),
						eq(planSteps.userId, input.userId),
					),
				);
			const hasSteps = (counts?.total ?? 0) > 0;
			const allDone = hasSteps && (counts?.pending ?? 0) === 0;
			if (allDone) {
				await this.setWorkflowStatus({
					userId: input.userId,
					workflowId: input.workflowId,
					status: "completed",
				});
			}
		}
	}

	async updateThread(input: {
		threadId: string;
		userId: string;
		patch: { title?: string; groupId?: string | null };
	}): Promise<{ id: string; title: string } | null> {
		const [row] = await this.client
			.update(threads)
			.set(input.patch)
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			)
			.returning({ id: threads.id, title: threads.title });
		return row ?? null;
	}

	async runControl(input: {
		threadId: string;
		userId: string;
		action: "run" | "stop";
	}): Promise<RunControlResult> {
		const [thread] = await this.client
			.select({
				id: threads.id,
				boundWorkflowId: threads.boundWorkflowId,
				status: threads.status,
			})
			.from(threads)
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			);
		if (!thread) {
			throw Object.assign(
				new Error(`Thread ${input.threadId} not found or not owned by user`),
				{ code: "THREAD_NOT_FOUND" },
			);
		}

		if (input.action === "stop") {
			await this.client.transaction(async (tx) => {
				await tx
					.update(threads)
					.set({ status: "idle" })
					.where(eq(threads.id, input.threadId));
				if (thread.boundWorkflowId) {
					await tx
						.update(planSteps)
						.set({ status: "idle" })
						.where(
							and(
								eq(planSteps.workflowId, thread.boundWorkflowId),
								inArray(planSteps.status, [
									"running",
									"retrying",
									"awaiting_approval",
									"sleeping",
								]),
							),
						);
				}
			});
			return { status: "stopped" };
		}

		if (!thread.boundWorkflowId) return { status: "no-bound-workflow" };

		return this.client.transaction(async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${input.threadId}))`,
			);
			const [fresh] = await tx
				.select({ status: threads.status })
				.from(threads)
				.where(eq(threads.id, input.threadId));
			if (fresh?.status === "running") return { status: "already-running" };
			return { status: "ok" };
		});
	}

	async setWorkflowStatus(input: {
		workflowId: string;
		userId: string;
		status: RunStatus;
	}): Promise<void> {
		await this.client
			.update(workflows)
			.set({ status: input.status })
			.where(
				and(
					eq(workflows.id, input.workflowId),
					eq(workflows.userId, input.userId),
				),
			);
	}

	async setThreadStatus(input: {
		threadId: string;
		userId: string;
		status: RunStatus;
	}): Promise<void> {
		await this.client
			.update(threads)
			.set({ status: input.status })
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			);
	}

	async boundWorkflow(
		threadId: string,
		userId: string,
	): Promise<Workflow | null> {
		const [row] = await this.client
			.select()
			.from(workflows)
			.where(
				and(eq(workflows.threadId, threadId), eq(workflows.userId, userId)),
			)
			.orderBy(asc(workflows.createdAt));
		return row ?? null;
	}

	async saveMessage(input: {
		userId: string;
		threadId: string;
		role: "user" | "assistant" | "system";
		content: string;
		parts?: unknown[];
		clientMessageId?: string;
		usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
		steps?: Array<{
			position: number;
			text?: string;
			toolCalls: StepToolCall[];
		}>;
	}): Promise<Message> {
		await this.assertThreadOwned(input.threadId, input.userId);

		const messageId = ids.message();

		return this.client.transaction(async (tx) => {
			const [savedMessage] = await tx
				.insert(messages)
				.values({
					id: messageId,
					threadId: input.threadId,
					userId: input.userId,
					role: input.role,
					content: input.content,
					...(input.parts ? { parts: input.parts } : {}),
					...(input.clientMessageId
						? { clientMessageId: input.clientMessageId }
						: {}),
					usage: input.usage,
				})
				.onConflictDoNothing({
					target: [
						messages.threadId,
						messages.userId,
						messages.clientMessageId,
					],
				})
				.returning();

			if (!savedMessage) {
				const [existing] = await tx
					.select()
					.from(messages)
					.where(
						and(
							eq(messages.threadId, input.threadId),
							eq(messages.userId, input.userId),
							eq(messages.clientMessageId, input.clientMessageId!),
						),
					)
					.limit(1);
				return existing!;
			}

			await tx
				.update(threads)
				.set({ lastMessageAt: new Date() })
				.where(eq(threads.id, input.threadId));

			if (input.steps && input.steps.length > 0) {
				const insertedSteps = await tx
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
									? new Date(call.endedAt).getTime() -
										new Date(call.startedAt).getTime()
									: null,
							tokens: input.usage ?? null,
							chainStack: null,
						});
					}
				}
				if (logRows.length > 0) {
					await tx.insert(toolCallLogs).values(logRows);
				}
			}

			return savedMessage;
		});
	}

	async logClientToolCall(input: {
		threadId: string;
		userId: string;
		toolName: string;
		toolCallId: string;
		output: unknown;
	}): Promise<void> {
		await this.client.insert(toolCallLogs).values({
			id: ids.toolCallLog(),
			messageId: null,
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
		limit?: number;
	}): Promise<{ messages: Message[] }> {
		const messagesQuery = this.client
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.threadId, input.threadId),
					eq(messages.userId, input.userId),
				),
			);
		const messageRows =
			input.limit != null
				? await messagesQuery
						.orderBy(desc(messages.createdAt))
						.limit(input.limit)
				: await messagesQuery.orderBy(asc(messages.createdAt));
		if (input.limit != null) {
			messageRows.reverse();
		}

		return { messages: messageRows };
	}

	async bindPlanDecision(input: {
		userId: string;
		threadId: string;
		uiMessages: UIMessage[];
	}): Promise<PlanBindResult> {
		const presentPlanAnswers = input.uiMessages
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
		if (!unboundDecision) return { status: "no-decision" };
		const wantsRunNow = unboundDecision.output.decision === "approved";

		const [threadRow] = await this.client
			.select({ boundWorkflowId: threads.boundWorkflowId })
			.from(threads)
			.where(
				and(eq(threads.id, input.threadId), eq(threads.userId, input.userId)),
			);
		if (!threadRow) {
			throw Object.assign(
				new Error(`Thread ${input.threadId} not found or not owned by user`),
				{ code: "THREAD_NOT_FOUND" },
			);
		}

		if (threadRow.boundWorkflowId) {
			this.reflectWorkflowId(
				input.uiMessages,
				unboundDecision.toolCallId,
				threadRow.boundWorkflowId,
			);
			return wantsRunNow
				? { status: "bound-approved", workflowId: threadRow.boundWorkflowId }
				: { status: "already-bound", workflowId: threadRow.boundWorkflowId };
		}

		const rawPlan = unboundDecision.input;
		if (
			rawPlan &&
			typeof rawPlan.title === "string" &&
			typeof rawPlan.objective === "string" &&
			Array.isArray(rawPlan.steps)
		) {
			const workflow = await this.workflowSvc.createWorkflowFromPlan({
				userId: input.userId,
				threadId: input.threadId,
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
			this.reflectWorkflowId(
				input.uiMessages,
				unboundDecision.toolCallId,
				workflow.id,
			);
			return wantsRunNow
				? { status: "bound-approved", workflowId: workflow.id }
				: { status: "bound", workflowId: workflow.id };
		}

		return { status: "no-decision" };
	}

	private reflectWorkflowId(
		uiMessages: UIMessage[],
		toolCallId: string | undefined,
		workflowId: string,
	): void {
		for (const m of uiMessages) {
			for (const p of m.parts as unknown as Array<Record<string, unknown>>) {
				if (
					p.type === "tool-presentPlan" &&
					p.toolCallId === toolCallId &&
					p.output != null &&
					typeof p.output === "object"
				) {
					(p.output as Record<string, unknown>).workflowId = workflowId;
				}
			}
		}
	}

	async syncClientMessages(input: {
		threadId: string;
		userId: string;
		clientMessages: Array<{ id?: string; role: string; parts: unknown[] }>;
	}): Promise<UIMessage[]> {
		const claimedIds = input.clientMessages
			.map((m) => m.id)
			.filter(
				(id): id is string => typeof id === "string" && id.startsWith("msg_"),
			);
		let ownedIds = new Set<string>();
		if (claimedIds.length > 0) {
			const owned = await this.client
				.select({ id: messages.id })
				.from(messages)
				.where(
					and(
						eq(messages.threadId, input.threadId),
						eq(messages.userId, input.userId),
						inArray(messages.id, claimedIds),
					),
				);
			ownedIds = new Set(owned.map((r: { id: string }) => r.id));
		}
		let anonCounter = 0;
		const nextAnonId = () => `local_${Date.now()}_anon${anonCounter++}`;

		const sanitized: UIMessage[] = [];
		const seenIds = new Set<string>();
		input.clientMessages.forEach((m, index) => {
			let id = m.id ?? `local_${Date.now()}_${index}`;
			if (id.startsWith("msg_") && !ownedIds.has(id)) {
				id = nextAnonId();
			}
			if (seenIds.has(id)) return;
			seenIds.add(id);
			sanitized.push({
				id,
				role: m.role as UIMessage["role"],
				parts: (m.parts as unknown[]).filter((p) => {
					const type = (p as { type?: string }).type;
					return type !== "reasoning" && type !== "reasoning-file";
				}) as UIMessage["parts"],
			});
		});

		for (const m of sanitized) {
			if (m.role !== "user") continue;
			if (m.id.startsWith("msg_") || m.id.startsWith("local_")) continue;
			const text = (m.parts as Array<{ type?: string; text?: string }>)
				.filter((p) => p.type === "text" && typeof p.text === "string")
				.map((p) => p.text as string)
				.join("\n")
				.trim();
			if (!text) continue;

			const saved = await this.saveMessage({
				userId: input.userId,
				threadId: input.threadId,
				role: "user",
				content: text,
				parts: m.parts as unknown[],
				clientMessageId: m.id,
			});
			if (saved.id !== m.id && !seenIds.has(saved.id)) {
				seenIds.delete(m.id);
				seenIds.add(saved.id);
				m.id = saved.id;
			}
		}

		return sanitized;
	}

	async persistFailedTurn(input: {
		threadId: string;
		userId: string;
		text: string;
	}): Promise<void> {
		try {
			await this.saveMessage({
				userId: input.userId,
				threadId: input.threadId,
				role: "system",
				content: input.text,
				parts: [{ type: "system-message", variant: "error", text: input.text }],
			});
			await this.setThreadStatus({
				threadId: input.threadId,
				userId: input.userId,
				status: "failed",
			});
		} catch (persistErr) {
			console.error("[chat-service] failed-turn persistence error", persistErr);
		}
	}

	private async assertThreadOwned(
		threadId: string,
		userId: string,
	): Promise<void> {
		const [row] = await this.client
			.select({ id: threads.id })
			.from(threads)
			.where(and(eq(threads.id, threadId), eq(threads.userId, userId)))
			.limit(1);
		if (!row) {
			throw new Error(`Thread ${threadId} not found or not owned by user`);
		}
	}
}
