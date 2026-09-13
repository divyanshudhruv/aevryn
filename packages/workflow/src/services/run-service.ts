import { db, ids, runs, runActivities, type Db, type Run, type RunActivity } from "@aevryn/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

const TERMINAL = new Set(["completed", "failed", "stopped"]);

export interface CreateRunInput {
	threadId: string;
	userId: string;
	trigger: "message" | "schedule" | "resume" | "approval" | "rerun";
	workflowId?: string;
	rerunOf?: string;
	promptSnapshot?: unknown;
}export interface RecordActivityInput {
		runId: string;
		type: "tool" | "thinking" | "task" | "subtask" | "system";
		status: "active" | "complete" | "failed";
		stepLabel?: string;
		title?: string;
		description?: string;
		detail?: unknown;
		parentId?: string;
	}

export class RunService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async create(input: CreateRunInput): Promise<Run> {
		const [row] = await this.scope()
			.insert(runs)
				.values({
					id: ids.run(),
					threadId: input.threadId,
					userId: input.userId,
					trigger: input.trigger,
					workflowId: input.workflowId ?? null,
					rerunOf: input.rerunOf ?? null,
					promptSnapshot: input.promptSnapshot ?? null,
					status: "awaiting_approval",
				})
			.returning();
		return row!;
	}

	async findById(id: string): Promise<Run | undefined> {
		return this.scope().query.runs.findFirst({
			where: eq(runs.id, id),
		});
	}

	async listByThread(threadId: string, limit = 50): Promise<Run[]> {
		return this.scope().query.runs.findMany({
			where: eq(runs.threadId, threadId),
			orderBy: [desc(runs.createdAt)],
			limit,
		});
	}

	async listByWorkflow(workflowId: string, limit = 50): Promise<Run[]> {
		return this.scope().query.runs.findMany({
			where: eq(runs.workflowId, workflowId),
			orderBy: [desc(runs.createdAt)],
			limit,
		});
	}

	async setStatus(
		id: string,
		status: "running" | "sleeping" | "awaiting_approval" | "failed" | "completed" | "idle" | "planning" | "stopped",
	): Promise<Run | undefined> {
		const finished =
			status === "completed" || status === "failed" || status === "stopped";
		const [row] = await this.scope()
			.update(runs)
			.set(
				finished
					? { status, finishedAt: new Date() }
					: { status, finishedAt: null },
			)
			.where(eq(runs.id, id))
			.returning();
		return row;
	}

	async recordUsage(
		id: string,
		usage: { tokenCount: number; costUsd: string | number },
	): Promise<Run | undefined> {
		const [row] = await this.scope()
			.update(runs)
			.set({
				tokenCount: usage.tokenCount,
				costUsd: String(usage.costUsd),
			})
			.where(eq(runs.id, id))
			.returning();
		return row;
	}

	async listPendingAfter(id: string): Promise<Run[]> {
		const run = await this.findById(id);
		if (!run) {
			return [];
		}
		return this.scope().query.runs.findMany({
			where: and(eq(runs.threadId, run.threadId), eq(runs.status, "awaiting_approval")),
			orderBy: [asc(runs.createdAt)],
		});
	}

	async createActivity(input: RecordActivityInput): Promise<RunActivity> {
		const [row] = await this.scope()
			.insert(runActivities)
			.values({
				id: ids.runActivity(),
				runId: input.runId,
				parentId: input.parentId ?? null,
				type: input.type,
				status: input.status,
				stepLabel: input.stepLabel ?? null,
				title: input.title ?? null,
				description: input.description ?? null,
				detail: input.detail ?? null,
				startedAt: input.status === "active" ? new Date() : null,
				completedAt:
					input.status === "complete" || input.status === "failed"
						? new Date()
						: null,
			})
			.returning();
		return row!;
	}

	async updateActivityStatus(
		activityId: string,
		status: "pending" | "active" | "complete" | "failed",
	): Promise<RunActivity | undefined> {
		const [row] = await this.scope()
			.update(runActivities)
			.set({
				status,
				startedAt: status === "active" ? new Date() : undefined,
				completedAt:
					status === "complete" || status === "failed" ? new Date() : null,
			})
			.where(eq(runActivities.id, activityId))
			.returning();
		return row;
	}

	async listActivitiesByRun(
		runId: string,
		limit = 200,
	): Promise<RunActivity[]> {
		return this.scope().query.runActivities.findMany({
			where: eq(runActivities.runId, runId),
			orderBy: [asc(runActivities.createdAt)],
			limit,
		});
	}

	/**
	 * Update a persisted activity's arbitrary jsonb detail (e.g. tool output
	 * on completion). The row was created earlier by `createActivity`.
	 */
	async updateActivityDetail(
		activityId: string,
		detail: unknown,
	): Promise<RunActivity | undefined> {
		const [row] = await this.scope()
			.update(runActivities)
			.set({ detail: detail as never })
			.where(eq(runActivities.id, activityId))
			.returning();
		return row;
	}

	/**
	 * Durable sleep: flip the run to `sleeping` and record a system activity
	 * carrying the wake time. `schedule-tick` consults these rows to wake due
	 * runs (listSleepingDue). Everything lives in run_activities — no separate
	 * agent-state blob.
	 */
	async sleepUntil(
		runId: string,
		sleepUntil: Date,
		reason?: string,
	): Promise<void> {
		await this.createActivity({
			runId,
			type: "system",
			status: "complete",
			stepLabel: "sleep",
			title: reason ?? "Sleeping",
			detail: { sleepUntil: sleepUntil.toISOString(), reason: reason ?? null },
		});
		await this.setStatus(runId, "sleeping");
	}

	/**
	 * In-place resume: flip a sleeping/waiting/awaiting_approval run back to
	 * `pending` and return it. The caller then fires a fresh thread/run pass
	 * (trigger=resume). No new run row is created.
	 */
	async resumeTriggeredBy(runId: string): Promise<Run | undefined> {
		const run = await this.findById(runId);
		if (!run) {
			return undefined;
		}
		if (
			run.status === "sleeping" ||
			run.status === "awaiting_approval"
		) {
			return (await this.setStatus(runId, "awaiting_approval")) ?? run;
		}
		return run;
	}

	/**
	 * Runs (`status=sleeping`) whose most recent sleep activity has already
	 * reached its wake time. Waking happens for the SAME run (trigger=resume),
	 * mirroring webhook resume.
	 */
	async listSleepingDue(now: Date): Promise<Run[]> {
		const sleeping = await this.scope().query.runs.findMany({
			where: eq(runs.status, "sleeping"),
			columns: { id: true },
		});
		const due: Run[] = [];
		for (const run of sleeping) {
			const [sleepActivity] = await this.scope().query.runActivities.findMany({
				where: and(
					eq(runActivities.runId, run.id),
					eq(runActivities.stepLabel, "sleep"),
				),
				orderBy: [desc(runActivities.createdAt)],
				limit: 1,
			});
			if (!sleepActivity) {
				continue;
			}
			const detail = (sleepActivity.detail ?? {}) as {
				sleepUntil?: string;
			};
			const until = detail.sleepUntil;
			if (until && new Date(until).getTime() <= now.getTime()) {
				const full = await this.findById(run.id);
				if (full) {
					due.push(full);
				}
			}
		}
		return due;
	}

	/**
	 * Replay map for a same-run bounded recovery: previously COMPLETED tool
	 * outputs are replayed from their tool activity rows instead of
	 * re-invoking the provider, so a write side effect can never execute twice.
	 * Keyed by tool name (step_label); the runtime consumes each entry once.
	 */
	async listReplayableToolOutputs(
		runId: string,
	): Promise<Record<string, unknown>> {
		const tools = await this.scope().query.runActivities.findMany({
			where: and(
				eq(runActivities.runId, runId),
				eq(runActivities.type, "tool"),
				eq(runActivities.status, "complete"),
			),
			orderBy: [asc(runActivities.createdAt)],
		});
		const replay: Record<string, unknown> = {};
		for (const tool of tools) {
			const name = tool.stepLabel;
			if (!name) {
				continue;
			}
			const detail = (tool.detail ?? {}) as { output?: unknown };
			if (detail.output == null || name in replay) {
				continue;
			}
			replay[name] = detail.output;
		}
		return replay;
	}

	/**
	 * Bounded recovery bookkeeping folded into run_activities: a system row
	 * `step_label="recovery"` per attempt. Idempotent per (runId, attempt):
	 * a concurrent failure handler cannot double-count an attempt.
	 */
	async recordRecoveryAttempt(runId: string, input: {
		attempt: number;
		failureClass: string;
		failureCode?: string;
		strategy: string;
		result: "started" | "completed" | "failed";
		detail?: Record<string, unknown>;
	}): Promise<RunActivity | undefined> {
		const existing = await this.scope().query.runActivities.findFirst({
			where: and(
				eq(runActivities.runId, runId),
				eq(runActivities.stepLabel, "recovery"),
				sql`${runActivities.detail}->>'attempt' = ${String(input.attempt)}`,
			),
		});
		if (existing) {
			return undefined;
		}
		return this.createActivity({
			runId,
			type: "system",
			status: "complete",
			stepLabel: "recovery",
			title: `Recovery attempt ${input.attempt}`,
			detail: {
				attempt: input.attempt,
				failureClass: input.failureClass,
				failureCode: input.failureCode ?? null,
				strategy: input.strategy,
				result: input.result,
				...(input.detail ?? {}),
			},
		});
	}

	async countRecoveryAttempts(runId: string): Promise<number> {
		const activities = await this.scope().query.runActivities.findMany({
			where: and(
				eq(runActivities.runId, runId),
				eq(runActivities.stepLabel, "recovery"),
			),
			columns: { id: true },
		});
		return activities.length;
	}

	async updateRecoveryResult(
		runId: string,
		attempt: number,
		result: "completed" | "failed",
		detail?: Record<string, unknown>,
	): Promise<void> {
		const activity = await this.scope().query.runActivities.findFirst({
			where: and(
				eq(runActivities.runId, runId),
				eq(runActivities.stepLabel, "recovery"),
				sql`${runActivities.detail}->>'attempt' = ${String(attempt)}`,
			),
		});
		if (!activity) {
			return;
		}
		const current = (activity.detail ?? {}) as Record<string, unknown>;
		await this.updateActivityDetail(activity.id, {
			...current,
			result,
			...detail,
		});
	}
}