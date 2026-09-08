import {
	db,
	type ToolExecution,
	type Workflow,
	type WorkflowExecution,
	type WorkflowStep,
} from "@aevryn/db";
import type { z } from "zod";
import { EventRepository } from "../repositories/event-repository";
import { ExecutionRepository } from "../repositories/execution-repository";
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
	type CreateWorkflow,
	completeExecutionSchema,
	createWorkflowSchema,
	type FailExecution,
	failExecutionSchema,
	type RecordSteps,
	recordStepsSchema,
	type StartExecution,
	startExecutionSchema,
	type statePatchSchema,
	type ToolCallRecord,
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

	async getExecution(executionId: string): Promise<WorkflowExecution | null> {
		return this.executions.findById(executionId);
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
			const toolRows = parsed.steps.flatMap((step) => {
				const stepRow = stepById.get(step.order);
				if (!stepRow) {
					return [];
				}
				return this.toToolExecutionRows(
					execution.workflowId,
					execution.id,
					stepRow.id,
					step.toolCalls,
				);
			});
			if (toolRows.length > 0) {
				await this.toolExecutions.insertMany(toolRows, tx);
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
			await this.workflows.setStatus(execution.workflowId, "completed", tx);
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
			await this.workflows.setStatus(execution.workflowId, "failed", tx);
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

	private toToolExecutionRows(
		workflowId: string,
		executionId: string,
		stepId: string,
		calls: ToolCallRecord[],
	) {
		return calls.map((call) => ({
			workflowId,
			executionId,
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
		}));
	}
}
