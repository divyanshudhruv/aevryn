import { createHash, randomBytes } from "node:crypto";
import {
	type Approval,
	db,
	type Notification,
	type Observation,
	type RecoveryAttempt,
	type Schedule,
	type ToolExecution,
	type Workflow,
	type WorkflowExecution,
	type WorkflowStep,
} from "@aevryn/db";
import { env } from "@aevryn/env/server";
import type { z } from "zod";
import { ApprovalRepository } from "../repositories/approval-repository";
import { EventRepository } from "../repositories/event-repository";
import { ExecutionRepository } from "../repositories/execution-repository";
import { NotificationRepository } from "../repositories/notification-repository";
import { ObservationRepository } from "../repositories/observation-repository";
import { RecoveryRepository } from "../repositories/recovery-repository";
import { ScheduleRepository } from "../repositories/schedule-repository";
import { StateRepository } from "../repositories/state-repository";
import { StepRepository } from "../repositories/step-repository";
import { ToolExecutionRepository } from "../repositories/tool-execution-repository";
import { WebhookRepository } from "../repositories/webhook-repository";
import { WorkflowRepository } from "../repositories/workflow-repository";
import {
	type ActivitySnapshot,
	type ApplyState,
	activitySnapshotSchema,
	applyStateSchema,
	type CompleteExecution,
	type CreateNotification,
	type CreateObservation,
	type CreateRecoveryAttempt,
	type CreateSchedule,
	type CreateWorkflow,
	completeExecutionSchema,
	createNotificationSchema,
	createObservationSchema,
	createRecoveryAttemptSchema,
	createScheduleSchema,
	createWorkflowSchema,
	decisionSchema,
	type FailExecution,
	failExecutionSchema,
	type Plan,
	type PlanProgress,
	planProgressSchema,
	planSchema,
	type RecordSteps,
	type ResolveApproval,
	recordStepsSchema,
	resolveApprovalSchema,
	type StartExecution,
	startExecutionSchema,
	type statePatchSchema,
	type ToolActivityUpsert,
	type ToolCallRecord,
	toolActivityUpsertSchema,
} from "../schemas";

type AgentStateValue = z.infer<typeof statePatchSchema>;

export interface CreateWorkflowOutcome {
	workflow: Workflow;
}

export interface StartExecutionOutcome {
	workflow: Workflow;
	execution: WorkflowExecution;
}

export interface RecordStepsOutcome {
	stepCount: number;
	toolCallCount: number;
}

export class WorkflowService {
	constructor(
		private readonly workflows = new WorkflowRepository(),
		private readonly executions = new ExecutionRepository(),
		private readonly steps = new StepRepository(),
		private readonly toolExecutions = new ToolExecutionRepository(),
		private readonly states = new StateRepository(),
		private readonly events = new EventRepository(),
		private readonly schedules = new ScheduleRepository(),
		private readonly notifications = new NotificationRepository(),
		private readonly observations = new ObservationRepository(),
		private readonly recoveries = new RecoveryRepository(),
		private readonly approvals = new ApprovalRepository(),
		private readonly webhooks = new WebhookRepository(),
	) {}

	async createWorkflow(input: CreateWorkflow): Promise<CreateWorkflowOutcome> {
		const parsed = createWorkflowSchema.parse(input);
		return db.transaction(async (tx) => {
			const workflow = await this.workflows.insert(
				{
					userId: parsed.userId,
					objective: parsed.objective,
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId: workflow.id,
					type: "workflow.created",
					data: {},
				},
				tx,
			);
			return { workflow };
		});
	}

	async startExecution(input: StartExecution): Promise<StartExecutionOutcome> {
		const parsed = startExecutionSchema.parse(input);
		return db.transaction(async (tx) => {
			const workflow = await this.workflows.requireById(parsed.workflowId, tx);
			const execution = await this.executions.insert(
				{
					workflowId: workflow.id,
					status: "running",
					startedAt: new Date(),
					prompt: parsed.prompt ?? "",
				},
				tx,
			);
			await this.workflows.setStatus(workflow.id, "active", tx);
			await this.events.insert(
				{
					workflowId: workflow.id,
					executionId: execution.id,
					type: "execution.started",
					data: {},
				},
				tx,
			);
			return { workflow, execution };
		});
	}

	async getWorkflowById(workflowId: string): Promise<Workflow | null> {
		return this.workflows.findById(workflowId);
	}

	/**
	 * Record a durable recovery attempt. Idempotent per (execution, attempt):
	 * re-runs of a failed function must not duplicate rows.
	 */
	async recordRecoveryAttempt(
		input: CreateRecoveryAttempt,
	): Promise<RecoveryAttempt | null> {
		const parsed = createRecoveryAttemptSchema.parse(input);
		const exists = await this.recoveries.existsByExecutionAttempt(
			parsed.executionId,
			parsed.attempt,
		);
		if (exists) {
			return null;
		}
		const attempt = await this.recoveries.insert({
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			stepId: parsed.stepId,
			failureClass: parsed.failureClass,
			failureCode: parsed.failureCode,
			attempt: parsed.attempt,
			strategy: parsed.strategy,
			result: parsed.result,
			detail: parsed.detail,
		});
		await this.events.insert({
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			type: "recovery.started",
			data: {
				attempt: attempt.attempt,
				failureClass: attempt.failureClass,
				failureCode: attempt.failureCode ?? null,
			},
		});
		return attempt;
	}

	async countRecoveryAttempts(executionId: string): Promise<number> {
		return this.recoveries.countByExecution(executionId);
	}

	async listRecoveryAttemptsByWorkflow(
		workflowId: string,
		limit = 50,
	): Promise<RecoveryAttempt[]> {
		return this.recoveries.listByWorkflow(workflowId, limit);
	}

	async getExecution(executionId: string): Promise<WorkflowExecution | null> {
		return this.executions.findById(executionId);
	}

	/**
	 * Append a user message to a thread as a new durable execution. The
	 * workflow's own status is untouched: a draft stays draft while the
	 * message is planned, an active workflow stays active while it runs.
	 */
	async enqueueMessage(
		workflowId: string,
		prompt: string,
	): Promise<StartExecutionOutcome> {
		return db.transaction(async (tx) => {
			const workflow = await this.workflows.requireById(workflowId, tx);
			const execution = await this.executions.insert(
				{
					workflowId: workflow.id,
					status: "running",
					startedAt: new Date(),
					prompt,
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId: workflow.id,
					executionId: execution.id,
					type: "execution.started",
					data: {},
				},
				tx,
			);
			return { workflow, execution };
		});
	}

	async recordSteps(input: RecordSteps): Promise<RecordStepsOutcome> {
		const parsed = recordStepsSchema.parse(input);
		const execution = await this.executions.requireById(parsed.executionId);
		return db.transaction(async (tx) => {
			const stepRows = await this.steps.insertMany(
				parsed.steps.map((step) => ({
					executionId: execution.id,
					kind: step.kind,
					assistantText: step.text ?? null,
					status: step.toolCalls.every((call) => call.status === "completed")
						? "completed"
						: "failed",
					order: step.order,
					startedAt: step.createdAt,
					completedAt: step.createdAt,
				})),
				tx,
			);
			const stepById = new Map(stepRows.map((row) => [row.order, row]));
			let toolOrder = 0;
			const toolRows = [];
			for (const step of parsed.steps) {
				const stepRow = stepById.get(step.order);
				for (const call of step.toolCalls) {
					toolRows.push(
						this.toToolExecutionRow(
							execution.workflowId,
							execution.id,
							stepRow?.id ?? null,
							toolOrder++,
							call,
						),
					);
				}
			}
			if (toolRows.length > 0) {
				await this.toolExecutions.upsertManyByOrder(toolRows, tx);
			}
			return {
				stepCount: stepRows.length,
				toolCallCount: toolRows.length,
			};
		});
	}

	async completeExecution(input: CompleteExecution): Promise<void> {
		const parsed = completeExecutionSchema.parse(input);
		return db.transaction(async (tx) => {
			const execution = await this.executions.update(
				parsed.executionId,
				{ status: "completed", completedAt: new Date() },
				tx,
			);
			const workflow = await this.workflows.findById(execution.workflowId);
			if (workflow && workflow.status !== "draft") {
				await this.workflows.setStatus(execution.workflowId, "completed", tx);
			}
			await this.events.insert(
				{
					workflowId: execution.workflowId,
					executionId: execution.id,
					type: "execution.completed",
					data: {},
				},
				tx,
			);
		});
	}

	async failExecution(input: FailExecution): Promise<void> {
		const parsed = failExecutionSchema.parse(input);
		return db.transaction(async (tx) => {
			const execution = await this.executions.update(
				parsed.executionId,
				{
					status: "failed",
					reason: parsed.reason,
					completedAt: new Date(),
				},
				tx,
			);
			const workflow = await this.workflows.findById(execution.workflowId);
			if (workflow && workflow.status !== "draft") {
				await this.workflows.setStatus(execution.workflowId, "failed", tx);
			}
			await this.events.insert(
				{
					workflowId: execution.workflowId,
					executionId: execution.id,
					type: "execution.failed",
					data: { reason: parsed.reason },
				},
				tx,
			);
		});
	}

	async applyState(input: ApplyState): Promise<{ version: number }> {
		const parsed = applyStateSchema.parse(input);
		const existing = await this.states.findByWorkflow(parsed.workflowId);
		if (!existing) {
			const next = this.mergeState({}, parsed.patch);
			await this.states.insert(
				{
					workflowId: parsed.workflowId,
					phase: next.phase,
					data: next,
				},
				db,
			);
			return { version: 1 };
		}
		const next = this.mergeState(existing.data, parsed.patch);
		const updated = await this.states.updateIfVersion(
			parsed.workflowId,
			parsed.expectedVersion,
			{ phase: next.phase, data: next },
			db,
		);
		return { version: updated.version };
	}

	async getState(workflowId: string): Promise<AgentStateValue | null> {
		const state = await this.states.findByWorkflow(workflowId);
		return state?.data ?? null;
	}

	/**
	 * Persist a live activity snapshot for a workflow. Overwrites the previous
	 * snapshot, so repeated writes are idempotent and safe across retries.
	 */
	async updateActivitySnapshot(
		workflowId: string,
		snapshot: ActivitySnapshot,
	): Promise<void> {
		const parsed = activitySnapshotSchema.parse(snapshot);
		const existing = await this.states.findByWorkflow(workflowId);
		await this.states.upsert(workflowId, {
			phase: "executing",
			data: {
				...existing?.data,
				data: {
					...(existing?.data?.data ?? {}),
					activity: parsed,
				},
			},
		});
	}

	async getActivitySnapshot(
		workflowId: string,
	): Promise<ActivitySnapshot | null> {
		const state = await this.states.findByWorkflow(workflowId);
		const activity = state?.data?.data?.activity;
		if (!activity) {
			return null;
		}
		const parsed = activitySnapshotSchema.safeParse(activity);
		return parsed.success ? parsed.data : null;
	}

	async getExecutionTimeline(executionId: string): Promise<{
		workflow: Workflow;
		execution: WorkflowExecution;
		steps: WorkflowStep[];
		toolExecutions: ToolExecution[];
		activity: ActivitySnapshot | null;
	}> {
		const execution = await this.executions.requireById(executionId);
		const workflow = await this.workflows.requireById(execution.workflowId);
		const activity = await this.getActivitySnapshot(workflow.id);
		return {
			workflow,
			execution,
			steps: await this.steps.listByExecution(execution.id),
			toolExecutions: await this.toolExecutions.listByExecution(execution.id),
			activity,
		};
	}

	async getThread(workflowId: string): Promise<{
		workflow: Workflow;
		plan: Plan | null;
		planProgress: PlanProgress | null;
		activity: ActivitySnapshot | null;
		schedules: Schedule[];
		notifications: Notification[];
		observations: Observation[];
		recoveryAttempts: RecoveryAttempt[];
		approvals: Approval[];
		turns: Array<{
			execution: WorkflowExecution;
			steps: WorkflowStep[];
			toolExecutions: ToolExecution[];
		}>;
	}> {
		const workflow = await this.workflows.requireById(workflowId);
		const executions = await this.executions.listByWorkflowChronological(
			workflowId,
			50,
		);
		const turns = await Promise.all(
			executions.map(async (execution) => ({
				execution,
				steps: await this.steps.listByExecution(execution.id),
				toolExecutions: await this.toolExecutions.listByExecution(execution.id),
			})),
		);
		return {
			workflow,
			plan: await this.getPlan(workflowId),
			planProgress: await this.getPlanProgress(workflowId),
			activity: await this.getActivitySnapshot(workflowId),
			schedules: await this.schedules.listByWorkflow(workflowId),
			notifications: await this.notifications.listByWorkflow(workflowId, 50),
			observations: await this.observations.listByWorkflow(workflowId),
			recoveryAttempts: await this.recoveries.listByWorkflow(workflowId, 20),
			approvals: await this.approvals.listByWorkflow(workflowId, 50),
			turns,
		};
	}

	async listNotificationsForUser(
		userId: string,
		limit = 50,
	): Promise<Notification[]> {
		return this.notifications.listByUser(userId, limit);
	}

	async markNotificationsRead(
		userId: string,
		ids?: string[],
	): Promise<{ marked: number }> {
		if (ids && ids.length > 0) {
			await this.notifications.markReadMany(ids, userId);
			return { marked: ids.length };
		}
		await this.notifications.markAllRead(userId);
		return { marked: -1 };
	}

	async getNotification(notificationId: string): Promise<Notification | null> {
		return this.notifications.findById(notificationId);
	}

	async markNotificationDelivered(notificationId: string): Promise<void> {
		await this.notifications.markDelivered(notificationId);
	}

	async countUnreadNotifications(userId: string): Promise<number> {
		return this.notifications.countUnread(userId);
	}

	/**
	 * Assemble the prior conversation in a thread as replay context for the
	 * current run. History is bounded by maxChars (the same context-cap the
	 * user controls). Content is compacted: the MOST RECENT turns are kept,
	 * long answers are trimmed, and the oldest omitted turns are reduced to a
	 * single count line so the model knows history exists without paying its
	 * full token cost.
	 */
	async getConversationContext(
		workflowId: string,
		excludeExecutionId: string,
		maxChars: number | undefined,
	): Promise<string | null> {
		const budget = maxChars ?? 6000;
		const executions = await this.executions.listByWorkflowChronological(
			workflowId,
			50,
		);
		const turns: Array<{ prompt: string; answer: string }> = [];
		for (const execution of executions) {
			if (execution.id === excludeExecutionId || !execution.prompt) {
				continue;
			}
			const steps = await this.steps.listByExecution(execution.id);
			const answer = steps[0]?.assistantText?.trim();
			if (!answer) {
				continue;
			}
			turns.push({
				prompt: execution.prompt,
				answer: answer.length > 1200 ? `${answer.slice(0, 1200)}…` : answer,
			});
		}
		if (turns.length === 0) {
			return null;
		}
		const blocks: string[] = [];
		let used = 0;
		let omitted = 0;
		for (const turn of turns.reverse()) {
			const block = `user: ${turn.prompt}\nassistant: ${turn.answer}`;
			if (used + block.length > budget) {
				omitted += 1;
				continue;
			}
			blocks.push(block);
			used += block.length;
		}
		if (blocks.length === 0) {
			return null;
		}
		const header =
			omitted > 0
				? `Prior messages in this thread (${omitted} older message${omitted === 1 ? "" : "s"} summarized and omitted for space):`
				: "Prior messages in this thread:";
		return `${header}\n${blocks.join("\n\n")}`;
	}

	async updatePlan(workflowId: string, plan: Plan | null): Promise<void> {
		const existing = await this.states.findByWorkflow(workflowId);
		await this.states.upsert(workflowId, {
			phase: "planning",
			data: {
				...(existing?.data ?? {}),
				phase: "planning",
				data: {
					...(existing?.data?.data ?? {}),
					plan: plan ?? null,
				},
			},
		});
	}

	async getPlan(workflowId: string): Promise<Plan | null> {
		const state = await this.states.findByWorkflow(workflowId);
		const candidate = state?.data?.data?.plan;
		if (!candidate) {
			return null;
		}
		const parsed = planSchema.safeParse(candidate);
		return parsed.success ? parsed.data : null;
	}

	async setPlanProgress(
		workflowId: string,
		progress: PlanProgress,
	): Promise<void> {
		const parsed = planProgressSchema.parse(progress);
		const existing = await this.states.findByWorkflow(workflowId);
		await this.states.upsert(workflowId, {
			phase: "executing",
			data: {
				...(existing?.data ?? {}),
				data: {
					...(existing?.data?.data ?? {}),
					planProgress: parsed,
				},
			},
		});
	}

	async getPlanProgress(workflowId: string): Promise<PlanProgress | null> {
		const state = await this.states.findByWorkflow(workflowId);
		const candidate = state?.data?.data?.planProgress;
		if (!candidate) {
			return null;
		}
		const parsed = planProgressSchema.safeParse(candidate);
		return parsed.success ? parsed.data : null;
	}

	async bindWorkflow(workflowId: string): Promise<void> {
		const workflow = await this.workflows.requireById(workflowId);
		if (workflow.status !== "draft") {
			throw new Error(
				`Workflow ${workflowId} is not in draft; cannot bind a started workflow`,
			);
		}
		const plan = await this.getPlan(workflowId);
		if (!plan) {
			throw new Error(`Workflow ${workflowId} has no plan to bind`);
		}
		return db.transaction(async (tx) => {
			await this.workflows.setStatus(workflowId, "active", tx);
			if (plan.objective) {
				await this.workflows.setObjective(workflowId, plan.objective, tx);
			}
			await this.events.insert(
				{
					workflowId,
					type: "workflow.bound",
					data: { title: plan.title, objective: plan.objective },
				},
				tx,
			);
		});
	}

	async discardPlan(workflowId: string): Promise<void> {
		await this.workflows.requireById(workflowId);
		await this.updatePlan(workflowId, null);
	}

	/**
	 * Edit a workflow's objective in place. The workflow is returned to draft
	 * (so the plan is regenerated on the next planning run) and the previously
	 * stored plan is cleared. Live executions keep their own history.
	 */
	async updateObjective(
		workflowId: string,
		objective: string,
	): Promise<Workflow> {
		const trimmed = objective.trim();
		if (!trimmed) {
			throw new Error("Objective cannot be empty");
		}
		return db.transaction(async (tx) => {
			const workflow = await this.workflows.requireById(workflowId, tx);
			const updated = await this.workflows.setObjective(
				workflowId,
				trimmed,
				tx,
			);
			if (workflow.status !== "draft") {
				await this.workflows.setStatus(workflowId, "draft", tx);
			}
			const existing = await this.states.findByWorkflow(workflowId, tx);
			await this.states.upsert(
				workflowId,
				{
					phase: "planning",
					data: {
						...(existing?.data ?? {}),
						phase: "planning",
						data: {
							...(existing?.data?.data ?? {}),
							plan: null,
						},
					},
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId,
					type: "workflow.objective_updated",
					data: { objective: trimmed },
				},
				tx,
			);
			return updated;
		});
	}

	/**
	 * Cancel all live executions of a workflow. The workflow keeps its own
	 * status (a bound thread stays active) so the user can Run it again.
	 */
	async stopExecution(workflowId: string): Promise<{ cancelled: number }> {
		const executions = await this.executions.listByWorkflow(workflowId, 50);
		const live = executions.filter((execution) =>
			["pending", "running", "sleeping"].includes(execution.status),
		);
		await this.workflows.requireById(workflowId);
		for (const execution of live) {
			await db.transaction(async (tx) => {
				await this.executions.update(
					execution.id,
					{ status: "cancelled", completedAt: new Date() },
					tx,
				);
				await this.events.insert(
					{
						workflowId,
						executionId: execution.id,
						type: "execution.cancelled",
						data: { reason: "stopped by user" },
					},
					tx,
				);
			});
		}
		return { cancelled: live.length };
	}

	async listRuns(
		userId: string,
		limit = 20,
	): Promise<
		Array<{
			workflow: Workflow;
			execution: WorkflowExecution | null;
			messageCount: number;
		}>
	> {
		const workflows = await this.workflows.listByUser(userId, limit);
		return Promise.all(
			workflows.map(async (workflow) => {
				const executions = await this.executions.listByWorkflow(workflow.id, 1);
				return {
					workflow,
					execution: executions[0] ?? null,
					messageCount: await this.executions.countByWorkflow(workflow.id),
				};
			}),
		);
	}

	async createObservation(input: CreateObservation): Promise<Observation> {
		const parsed = createObservationSchema.parse(input);
		return db.transaction(async (tx) => {
			await this.workflows.requireById(parsed.workflowId, tx);
			const row = await this.observations.insert(parsed, tx);
			await this.events.insert(
				{
					workflowId: parsed.workflowId,
					type: "observation.created",
					data: { type: parsed.type },
				},
				tx,
			);
			return row;
		});
	}

	async listObservations(workflowId: string): Promise<Observation[]> {
		return this.observations.listByWorkflow(workflowId);
	}

	async createSchedule(input: CreateSchedule): Promise<Schedule> {
		const parsed = createScheduleSchema.parse(input);
		return db.transaction(async (tx) => {
			const workflow = await this.workflows.requireById(parsed.workflowId, tx);
			if (workflow.userId !== parsed.userId) {
				throw new Error(
					`Schedule access denied for workflow ${parsed.workflowId}`,
				);
			}
			const row = await this.schedules.insert(
				{
					workflowId: parsed.workflowId,
					cron: parsed.cron,
					intervalSeconds: parsed.intervalSeconds,
					nextRunAt: parsed.startAt ?? new Date(),
					config: parsed.config,
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId: parsed.workflowId,
					type: "schedule.created",
					data: {
						scheduleId: row.id,
						cron: parsed.cron ?? null,
						intervalSeconds: parsed.intervalSeconds ?? null,
					},
				},
				tx,
			);
			return row;
		});
	}

	async listSchedules(workflowId: string): Promise<Schedule[]> {
		return this.schedules.listByWorkflow(workflowId);
	}

	async listDueSchedules(now: Date): Promise<Schedule[]> {
		return this.schedules.findDue(now);
	}

	async markScheduleRan(
		scheduleId: string,
		nextRunAt: Date,
		lastRunAt = new Date(),
	): Promise<Schedule> {
		return this.schedules.update(scheduleId, { nextRunAt, lastRunAt });
	}

	async setScheduleEnabled(
		scheduleId: string,
		enabled: boolean,
	): Promise<Schedule> {
		return this.schedules.setEnabled(scheduleId, enabled);
	}

	async toggleSchedule(
		workflowId: string,
		scheduleId: string,
		enabled: boolean,
	): Promise<Schedule> {
		const existing = await this.schedules.findById(scheduleId);
		if (!existing || existing.workflowId !== workflowId) {
			throw new Error(`Schedule ${scheduleId} not found for workflow`);
		}
		return this.schedules.setEnabled(scheduleId, enabled);
	}

	async deleteSchedule(scheduleId: string, workflowId: string): Promise<void> {
		await db.transaction(async (tx) => {
			const existing = await this.schedules.findById(scheduleId, tx);
			if (!existing || existing.workflowId !== workflowId) {
				throw new Error(`Schedule ${scheduleId} not found for workflow`);
			}
			await this.schedules.delete(scheduleId, tx);
			await this.events.insert(
				{
					workflowId,
					type: "schedule.deleted",
					data: { scheduleId },
				},
				tx,
			);
		});
	}

	/**
	 * Persist durable approval requests raised by an agent run. Idempotent:
	 * a retried run must not duplicate an already-pending request for the same
	 * write action on the same execution.
	 */
	async recordApprovalRequests(
		workflowId: string,
		executionId: string,
		requests: Array<{ toolName: string; input: unknown }>,
	): Promise<Approval[]> {
		const workflow = await this.workflows.requireById(workflowId);
		const created: Approval[] = [];
		for (const request of requests) {
			const exists = await this.approvals.existsPendingForExecution(
				executionId,
				request.toolName,
			);
			if (exists) {
				continue;
			}
			const row = await this.approvals.insert({
				workflowId,
				executionId,
				userId: workflow.userId,
				toolName: request.toolName,
				input: (request.input ?? {}) as Record<string, unknown>,
			});
			await this.events.insert({
				workflowId,
				executionId,
				type: "approval.requested",
				data: { approvalId: row.id, toolName: row.toolName },
			});
			created.push(row);
		}
		return created;
	}

	async listApprovalsByWorkflow(
		workflowId: string,
		limit = 50,
	): Promise<Approval[]> {
		return this.approvals.listByWorkflow(workflowId, limit);
	}

	async countPendingApprovals(workflowId: string): Promise<number> {
		return this.approvals.countPendingByWorkflow(workflowId);
	}

	async getPendingApprovalsForExecution(
		executionId: string,
	): Promise<Approval[]> {
		return this.approvals.listPendingByExecution(executionId);
	}

	/**
	 * Resolve a single approval request. Ownership is enforced inside the
	 * transaction: the acting user must own the owning workflow. Returns
	 * enough to let the API resume (or fail) the held execution.
	 */
	async resolveApproval(
		input: ResolveApproval,
		userId: string,
	): Promise<{
		resolution: "approved" | "denied";
		remainingPending: number;
		onlyApproved: Approval[];
		execution: WorkflowExecution | null;
		workflow: Workflow;
	}> {
		const parsed = resolveApprovalSchema.parse(input);
		const approval = await this.approvals.findById(parsed.approvalId);
		if (!approval) {
			throw new Error(`Approval ${parsed.approvalId} not found`);
		}
		const workflow = await this.workflows.requireById(parsed.workflowId);
		if (workflow.userId !== userId || approval.workflowId !== workflow.id) {
			throw new Error("Approval does not belong to the current user");
		}
		if (approval.status !== "pending") {
			throw new Error(`Approval is already ${approval.status}`);
		}
		const status = parsed.resolve === "approve" ? "approved" : "denied";
		await this.approvals.setStatus(approval.id, status, parsed.reason);
		await this.events.insert({
			workflowId: workflow.id,
			executionId: approval.executionId ?? undefined,
			type:
				parsed.resolve === "approve" ? "approval.approved" : "approval.denied",
			data: { approvalId: approval.id, toolName: approval.toolName },
		});
		const remainingPending = approval.executionId
			? await this.approvals.countPendingByExecution(approval.executionId)
			: 0;
		const onlyApproved = approval.executionId
			? await this.approvals.listApprovedByExecution(approval.executionId)
			: [];
		const execution = approval.executionId
			? await this.executions.findById(approval.executionId)
			: null;
		return {
			resolution: status,
			remainingPending,
			onlyApproved,
			execution,
			workflow,
		};
	}

	/**
	 * Put an execution (and its workflow) into the durable awaiting_approval
	 * state. The run must not proceed until every pending approval is resolved.
	 */
	async holdExecutionForApproval(
		executionId: string,
		reason = "Awaiting user approval for a consequential action",
	): Promise<void> {
		await db.transaction(async (tx) => {
			const execution = await this.executions.update(
				executionId,
				{ status: "awaiting_approval", reason },
				tx,
			);
			await this.workflows.setStatus(
				execution.workflowId,
				"awaiting_approval",
				tx,
			);
			await this.events.insert(
				{
					workflowId: execution.workflowId,
					executionId: execution.id,
					type: "execution.approval_pending",
					data: {},
				},
				tx,
			);
		});
	}

	/**
	 * Pause a workflow: no scheduled fires or wakes while paused, and any live
	 * run is cancelled. The user can Resume (or Run) manually afterwards.
	 */
	async pauseWorkflow(workflowId: string): Promise<{ cancelled: number }> {
		const workflow = await this.workflows.requireById(workflowId);
		if (workflow.status === "draft") {
			throw new Error("Draft workflows cannot be paused");
		}
		const executions = await this.executions.listByWorkflow(workflowId, 50);
		const live = executions.filter((execution) =>
			["pending", "running"].includes(execution.status),
		);
		await db.transaction(async (tx) => {
			await this.workflows.setStatus(workflowId, "paused", tx);
			await this.events.insert(
				{ workflowId, type: "workflow.paused", data: {} },
				tx,
			);
			for (const execution of live) {
				await this.executions.update(
					execution.id,
					{
						status: "cancelled",
						reason: "paused by user",
						completedAt: new Date(),
					},
					tx,
				);
				await this.events.insert(
					{
						workflowId,
						executionId: execution.id,
						type: "execution.cancelled",
						data: { reason: "paused by user" },
					},
					tx,
				);
			}
		});
		return { cancelled: live.length };
	}

	async resumeWorkflow(workflowId: string): Promise<void> {
		const workflow = await this.workflows.requireById(workflowId);
		if (workflow.status !== "paused") {
			throw new Error(`Workflow is ${workflow.status}, not paused`);
		}
		await db.transaction(async (tx) => {
			await this.workflows.setStatus(workflowId, "active", tx);
			await this.events.insert(
				{ workflowId, type: "workflow.resumed", data: {} },
				tx,
			);
		});
	}

	/** Hard delete a workflow. Child rows cascade; any in-flight agent work
	 *  fails fast client-side with "execution not found". */
	async deleteWorkflow(workflowId: string): Promise<void> {
		await this.workflows.requireById(workflowId);
		await this.workflows.delete(workflowId);
	}

	async setWorkflowObjective(
		workflowId: string,
		objective: string,
	): Promise<void> {
		await this.workflows.setObjective(workflowId, objective);
		await this.events.insert({
			workflowId,
			type: "workflow.objective.updated",
			data: { objective },
		});
	}

	async setWorkflowCustomPrompt(
		workflowId: string,
		customPrompt: string | null,
	): Promise<void> {
		await this.workflows.setCustomPrompt(workflowId, customPrompt);
		await this.events.insert({
			workflowId,
			type: "workflow.custom_prompt.updated",
			data: { customPrompt },
		});
	}

	/**
	 * Persist token/cost usage for an execution. Cheap enough to also fire on
	 * the failure path; never throws into the caller.
	 */
	async recordUsage(
		executionId: string,
		usage: { tokenCount: number; costUsd: number },
	): Promise<void> {
		await this.executions.update(executionId, {
			status: "running",
			tokenCount: usage.tokenCount,
			costUsd: usage.costUsd,
		});
	}

	/**
	 * Replay map for a same-execution retry: previously COMPLETED tool outputs
	 * are replayed from persistence instead of re-invoking the provider, so a
	 * bounded recovery pass can never double a write side effect. The map is
	 * keyed by tool name; the runtime consumes each entry once per run.
	 */
	async listReplayableToolOutputs(
		executionId: string,
	): Promise<Record<string, unknown>> {
		const tools = await this.toolExecutions.listByExecution(executionId);
		const replay: Record<string, unknown> = {};
		for (const tool of tools) {
			if (tool.status !== "completed" || tool.output == null) {
				continue;
			}
			if (!(tool.tool in replay)) {
				replay[tool.tool] = tool.output;
			}
		}
		return replay;
	}

	async createNotification(input: CreateNotification): Promise<Notification> {
		const parsed = createNotificationSchema.parse(input);
		return db.transaction(async (tx) => {
			if (parsed.workflowId) {
				await this.workflows.requireById(parsed.workflowId, tx);
			}
			const row = await this.notifications.insert(
				{
					userId: parsed.userId,
					workflowId: parsed.workflowId,
					type: parsed.type,
					channel: parsed.channel,
					subject: parsed.subject,
					body: parsed.body,
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId: parsed.workflowId,
					type: "notification.created",
					data: {
						notificationId: row.id,
						type: parsed.type,
						channel: parsed.channel,
					},
				},
				tx,
			);
			return row;
		});
	}

	async listNotifications(workflowId: string): Promise<Notification[]> {
		return this.notifications.listByWorkflow(workflowId);
	}

	/**
	 * Optimistically apply a validated state patch. Reads the current
	 * version and retries on conflict (a single writer owns each workflow,
	 * so contention is rare); the state row is created on first write.
	 */
	async applyStatePatch(
		workflowId: string,
		patch: AgentStateValue,
	): Promise<{ version: number }> {
		for (let attempt = 0; attempt < 3; attempt++) {
			const existing = await this.states.findByWorkflow(workflowId);
			const next = this.mergeState(existing?.data, patch);
			if (!existing) {
				await this.states.insert({
					workflowId,
					phase: next.phase,
					data: next,
				});
				return { version: 1 };
			}
			try {
				const updated = await this.states.updateIfVersion(
					workflowId,
					existing.version,
					{ phase: next.phase, data: next },
				);
				return { version: updated.version };
			} catch (error) {
				if (attempt === 2) throw error;
			}
		}
		throw new Error("applyStatePatch: optimistic concurrency exhausted");
	}

	async sleepExecution(
		executionId: string,
		sleepUntil: Date,
		reason?: string,
	): Promise<void> {
		return db.transaction(async (tx) => {
			const execution = await this.executions.update(
				executionId,
				{ status: "sleeping", reason },
				tx,
			);
			const workflowId = execution.workflowId;
			const existing = await this.states.findByWorkflow(workflowId);
			await this.states.upsert(
				workflowId,
				{
					phase: "sleeping",
					data: {
						...(existing?.data ?? {}),
						data: {
							...(existing?.data?.data ?? {}),
							sleepUntil: sleepUntil.toISOString(),
							sleepReason: reason ?? null,
						},
					},
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId,
					executionId: execution.id,
					type: "execution.sleeping",
					data: { sleepUntil: sleepUntil.toISOString() },
				},
				tx,
			);
		});
	}

	async listSleepingExecutions(): Promise<WorkflowExecution[]> {
		return this.executions.listByStatus("sleeping");
	}

	/**
	 * Sleeping executions whose persisted wake time has passed. Used by the
	 * schedule-tick function to resume them with a fresh durable execution.
	 */
	async listDueSleepingExecutions(now: Date): Promise<WorkflowExecution[]> {
		const sleeping = await this.executions.listByStatus("sleeping");
		const due: WorkflowExecution[] = [];
		for (const execution of sleeping) {
			const state = await this.states.findByWorkflow(execution.workflowId);
			const sleepUntil = (
				state?.data?.data as Record<string, unknown> | undefined
			)?.sleepUntil as string | undefined;
			if (sleepUntil && new Date(sleepUntil).getTime() <= now.getTime()) {
				due.push(execution);
			}
		}
		return due;
	}

	/**
	 * Mark a sleeping execution as superseded when a new wake execution is
	 * started. The execution closes without changing the workflow status (an
	 * active monitor stays active for its next run).
	 */
	async completeSupersededExecution(
		executionId: string,
		reason = "superseded by wake execution",
	): Promise<void> {
		await this.executions.update(executionId, {
			status: "completed",
			reason,
			completedAt: new Date(),
		});
	}

	async cancelExecution(
		executionId: string,
		reason = "cancelled by decision",
	): Promise<void> {
		return db.transaction(async (tx) => {
			const execution = await this.executions.update(
				executionId,
				{ status: "cancelled", completedAt: new Date(), reason },
				tx,
			);
			await this.events.insert(
				{
					workflowId: execution.workflowId,
					executionId: execution.id,
					type: "execution.cancelled",
					data: { reason },
				},
				tx,
			);
		});
	}

	/**
	 * Transition an execution into a durable waiting state, minting a secret
	 * webhook token. Only the SHA-256 hash is persisted; the plaintext token is
	 * returned once so it can be shown to the user without being stored.
	 */
	async waitForWebhook(input: {
		workflowId: string;
		executionId: string;
		instruction: string;
		expiresInSeconds?: number;
		reason?: string;
	}): Promise<{ token: string; url: string }> {
		const token = randomBytes(24).toString("base64url");
		const tokenHash = createHash("sha256").update(token).digest("hex");
		const expiresAt = input.expiresInSeconds
			? new Date(Date.now() + input.expiresInSeconds * 1000)
			: undefined;
		await db.transaction(async (tx) => {
			const execution = await this.executions.update(
				input.executionId,
				{ status: "waiting", reason: input.reason ?? input.instruction },
				tx,
			);
			await this.webhooks.insert(
				{
					workflowId: input.workflowId,
					executionId: execution.id,
					tokenHash,
					instruction: input.instruction,
					expiresAt,
				},
				tx,
			);
			await this.events.insert(
				{
					workflowId: input.workflowId,
					executionId: execution.id,
					type: "execution.waiting",
					data: { expiresAt: expiresAt?.toISOString() ?? null },
				},
				tx,
			);
		});
		return {
			token,
			url: `${env.WEBHOOK_BASE_URL}/api/v1/hooks/${token}`,
		};
	}

	/**
	 * Resolve an incoming webhook by its plaintext token. The token is never
	 * stored or logged; only its hash is looked up. Expired or consumed
	 * webhooks resolve to null, causing the caller to return a 410/404.
	 */
	async fireWebhook(input: { token: string; payload: unknown }): Promise<{
		ok: boolean;
		workflowId?: string;
		executionId?: string;
		instruction?: string;
	}> {
		const tokenHash = createHash("sha256").update(input.token).digest("hex");
		const row = await this.webhooks.findByTokenHash(tokenHash);
		if (!row) {
			return { ok: false };
		}
		if (row.status !== "active") {
			return { ok: false };
		}
		if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
			await this.webhooks.updateStatus(row.id, "expired");
			return { ok: false };
		}
		await this.webhooks.updateStatus(row.id, "used", new Date());
		const excerpt = JSON.stringify(input.payload);
		const instruction =
			excerpt && excerpt.length > 0
				? `${row.instruction}\nWebhook payload: ${excerpt.slice(0, 2000)}`
				: row.instruction;
		return {
			ok: true,
			workflowId: row.workflowId,
			executionId: row.executionId ?? undefined,
			instruction,
		};
	}

	async updateRecoveryResult(
		executionId: string,
		attempt: number,
		result: "completed" | "failed",
		detail?: Record<string, unknown>,
	): Promise<void> {
		await this.recoveries.updateResult(executionId, attempt, result, detail);
	}

	/**
	 * Apply a fully validated LLM decision. The runtime is authoritative:
	 * the model proposes, this method verifies and persists. Persists a
	 * concise decision event (never chain-of-thought).
	 */
	async applyDecision(input: {
		workflowId: string;
		executionId: string;
		decision: z.infer<typeof decisionSchema>;
	}): Promise<{
		action: string;
		deliverables: Array<{ notificationId: string; channel: string }>;
	}> {
		const decision = decisionSchema.parse(input.decision);
		const workflow = await this.workflows.requireById(input.workflowId);
		const deliverables: Array<{
			notificationId: string;
			channel: string;
		}> = [];
		if (decision.action !== "wait" && decision.notification) {
			const channel = decision.notification.channel ?? "in-app";
			if (channel === "webhook") {
				const body = (decision.notification.body ?? {}) as Record<
					string,
					unknown
				>;
				if (typeof body.url !== "string" || !/^https?:\/\//.test(body.url)) {
					throw new Error(
						"A webhook notification requires a body.url (http/https) destination",
					);
				}
			}
			const notification = await this.createNotification({
				userId: workflow.userId,
				workflowId: workflow.id,
				type: decision.notification.type,
				channel,
				subject: decision.notification.subject,
				body: decision.notification.body,
			});
			deliverables.push({ notificationId: notification.id, channel });
		}
		if (decision.observation) {
			await this.createObservation({
				workflowId: workflow.id,
				type: decision.observation.type,
				content: decision.observation.content,
			});
		}
		if (decision.statePatch) {
			await this.applyStatePatch(workflow.id, decision.statePatch);
		}
		if (decision.planProgress) {
			await this.setPlanProgress(workflow.id, decision.planProgress);
		}
		await this.events.insert({
			workflowId: workflow.id,
			executionId: input.executionId,
			type: "execution.decision",
			data: {
				action: decision.action,
				reason: decision.reason ?? null,
				sleepUntil: decision.sleepUntil?.toISOString() ?? null,
				planProgress: decision.planProgress ?? null,
			},
		});
		switch (decision.action) {
			case "sleep":
				if (!decision.sleepUntil) {
					throw new Error("sleep decision requires sleepUntil");
				}
				await this.sleepExecution(
					input.executionId,
					decision.sleepUntil,
					decision.reason,
				);
				break;
			case "wait": {
				if (!decision.waitFor) {
					throw new Error("wait decision requires waitFor");
				}
				const webhook = await this.waitForWebhook({
					workflowId: workflow.id,
					executionId: input.executionId,
					instruction: decision.waitFor.description,
					expiresInSeconds: decision.waitFor.expiresInSeconds,
					reason: decision.reason,
				});
				if (decision.notification) {
					await this.createNotification({
						userId: workflow.userId,
						workflowId: workflow.id,
						type: decision.notification.type,
						channel: "in-app",
						subject: decision.notification.subject,
						body: {
							...(decision.notification.body ?? {}),
							webhookUrl: webhook.url,
							instruction: decision.waitFor.description,
						},
					});
				}
				break;
			}
			case "stop":
				await this.cancelExecution(input.executionId, decision.reason);
				break;
			case "complete":
			case "notify":
				await this.completeExecution({ executionId: input.executionId });
				break;
		}
		return { action: decision.action, deliverables };
	}

	private mergeState(
		current: AgentStateValue | undefined,
		patch: AgentStateValue,
	): AgentStateValue {
		const next = { ...(current ?? {}) };
		for (const key of ["phase", "context"] as const) {
			if (patch[key] !== undefined) {
				next[key] = patch[key];
			}
		}
		next.data = {
			...(current?.data ?? {}),
			...(patch.data ?? {}),
		};
		return next;
	}

	/**
	 * Persist a live tool activity record. Idempotent: the (execution, order)
	 * pair is unique, so a retried run updates the same row instead of
	 * duplicating tool calls.
	 */
	async upsertToolActivity(input: ToolActivityUpsert): Promise<void> {
		const parsed = toolActivityUpsertSchema.parse(input);
		await this.toolExecutions.upsertByOrder({
			workflowId: parsed.workflowId,
			executionId: parsed.executionId,
			order: parsed.order,
			tool: parsed.tool,
			status: parsed.status,
			input: parsed.input ?? {},
		});
	}

	private toToolExecutionRow(
		workflowId: string,
		executionId: string,
		stepId: string | null,
		order: number,
		call: ToolCallRecord,
	) {
		return {
			workflowId,
			executionId,
			order,
			stepId,
			tool: call.toolName,
			provider: call.provider?.id,
			status:
				call.status === "completed"
					? ("completed" as const)
					: ("failed" as const),
			input: call.input,
			output: call.output,
			errorCode: call.error?.code,
			durationMs: call.provider?.durationMs
				? Math.round(call.provider.durationMs)
				: undefined,
		};
	}
}
