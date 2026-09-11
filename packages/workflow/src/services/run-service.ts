import { db, ids, runs, runActivities, type Db, type Run, type RunActivity } from "@aevryn/db";
import { and, asc, desc, eq } from "drizzle-orm";

export interface CreateRunInput {
	threadId: string;
	userId: string;
	trigger: "message" | "schedule" | "resume" | "approval" | "rerun";
	workflowId?: string;
	rerunOf?: string;
	promptSnapshot?: unknown;
}

export interface RecordActivityInput {
	runId: string;
	type: "tool" | "thinking" | "task" | "subtask" | "system";
	status: "pending" | "active" | "complete" | "failed";
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
				status: "pending",
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
		status: "pending" | "running" | "sleeping" | "waiting" | "awaiting_approval" | "completed" | "failed" | "cancelled",
	): Promise<Run | undefined> {
		const finished =
			status === "completed" || status === "failed" || status === "cancelled";
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
			where: and(eq(runs.threadId, run.threadId), eq(runs.status, "pending")),
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
}