import {
	db,
	type Notification,
	type Observation,
	type Schedule,
	type ToolExecution,
	type Workflow,
	type WorkflowExecution,
	type WorkflowStep,
} from "@aevryn/db";
import type { z } from "zod";
import { EventRepository } from "../repositories/event-repository";
import { ExecutionRepository } from "../repositories/execution-repository";
import { NotificationRepository } from "../repositories/notification-repository";
import { ObservationRepository } from "../repositories/observation-repository";
import { ScheduleRepository } from "../repositories/schedule-repository";
import { StateRepository } from "../repositories/state-repository";
import { StepRepository } from "../repositories/step-repository";
import { ToolExecutionRepository } from "../repositories/tool-execution-repository";
import { WorkflowRepository } from "../repositories/workflow-repository";
import {
	type ActivitySnapshot,
	type ApplyState,
	activitySnapshotSchema,
	applyStateSchema,
	type CompleteExecution,
	type CreateNotification,
	type CreateObservation,
	type CreateSchedule,
	type CreateWorkflow,
	completeExecutionSchema,
	createNotificationSchema,
	createObservationSchema,
	createScheduleSchema,
	createWorkflowSchema,
	decisionSchema,
	type FailExecution,
	failExecutionSchema,
	type Plan,
	planSchema,
	type RecordSteps,
	recordStepsSchema,
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
		activity: ActivitySnapshot | null;
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
			activity: await this.getActivitySnapshot(workflowId),
			turns,
		};
	}

	/**
	 * Assemble the prior conversation in a thread as replay context for the
	 * current run. History is bounded by maxChars (the same context-cap the
	 * user controls); oldest messages are dropped first. Only turns that have
	 * a persisted assistant answer are included.
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
		const blocks: string[] = [];
		let used = 0;
		for (const execution of executions) {
			if (execution.id === excludeExecutionId || !execution.prompt) {
				continue;
			}
			const steps = await this.steps.listByExecution(execution.id);
			const answer = steps[0]?.assistantText?.trim();
			if (!answer) {
				continue;
			}
			const block = `user: ${execution.prompt}\nassistant: ${answer}`;
			if (used + block.length > budget) {
				break;
			}
			blocks.unshift(block);
			used += block.length;
		}
		if (blocks.length === 0) {
			return null;
		}
		return `Prior messages in this thread:\n${blocks.join("\n\n")}`;
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
		}>
	> {
		const workflows = await this.workflows.listByUser(userId, limit);
		return Promise.all(
			workflows.map(async (workflow) => {
				const executions = await this.executions.listByWorkflow(workflow.id, 1);
				return { workflow, execution: executions[0] ?? null };
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
	 * Apply a fully validated LLM decision. The runtime is authoritative:
	 * the model proposes, this method verifies and persists. Persists a
	 * concise decision event (never chain-of-thought).
	 */
	async applyDecision(input: {
		workflowId: string;
		executionId: string;
		decision: z.infer<typeof decisionSchema>;
	}): Promise<{ action: string }> {
		const decision = decisionSchema.parse(input.decision);
		const workflow = await this.workflows.requireById(input.workflowId);
		if (decision.notification) {
			await this.createNotification({
				userId: workflow.userId,
				workflowId: workflow.id,
				type: decision.notification.type,
				channel: "in-app",
				subject: decision.notification.subject,
				body: decision.notification.body,
			});
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
		await this.events.insert({
			workflowId: workflow.id,
			executionId: input.executionId,
			type: "execution.decision",
			data: {
				action: decision.action,
				reason: decision.reason ?? null,
				sleepUntil: decision.sleepUntil?.toISOString() ?? null,
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
			case "stop":
				await this.cancelExecution(input.executionId, decision.reason);
				break;
			case "complete":
			case "notify":
				await this.completeExecution({ executionId: input.executionId });
				break;
		}
		return { action: decision.action };
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
