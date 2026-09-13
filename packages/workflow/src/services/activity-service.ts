import type { ActivityStatus, ActivityType, Db, RunActivity } from "@aevryn/db";
import { db, ids, runActivities } from "@aevryn/db";
import { asc, eq } from "drizzle-orm";

export interface RecordActivityInput {
	runId: string;
	type: ActivityType;
	status?: ActivityStatus;
	stepLabel?: string;
	title?: string;
	description?: string;
	detail?: unknown;
	parentId?: string;
}

/**
 * Activity recorder — THE single write path for run_activities.
 * Chat HTTP path and the durable runner both go through this so the
 * visible execution trace has one consistent shape.
 */
export class ActivityService {
	constructor(private readonly client: Db = db) {}

	async record(input: RecordActivityInput): Promise<RunActivity> {
		const status = input.status ?? "pending";
		const [row] = await this.client
			.insert(runActivities)
			.values({
				id: ids.runActivity(),
				runId: input.runId,
				parentId: input.parentId ?? null,
				type: input.type,
				status,
				stepLabel: input.stepLabel ?? null,
				title: input.title ?? null,
				description: input.description ?? null,
				detail: input.detail ?? null,
				startedAt: status === "running" ? new Date() : null,
				completedAt:
					status === "completed" || status === "failed" ? new Date() : null,
			})
			.returning();
		return row!;
	}

	async updateStatus(
		activityId: string,
		status: ActivityStatus,
		detail?: unknown,
	): Promise<RunActivity | undefined> {
		const [row] = await this.client
			.update(runActivities)
			.set({
				status,
				startedAt: status === "running" ? new Date() : undefined,
				completedAt:
					status === "completed" || status === "failed" ? new Date() : null,
				...(detail !== undefined ? { detail: detail as never } : {}),
			})
			.where(eq(runActivities.id, activityId))
			.returning();
		return row;
	}

	async listByRun(runId: string, limit = 200): Promise<RunActivity[]> {
		return this.client.query.runActivities.findMany({
			where: eq(runActivities.runId, runId),
			orderBy: [asc(runActivities.createdAt)],
			limit,
		});
	}
}

export const activityService = new ActivityService();
