import {
	db,
	ids,
	schedules,
	type Db,
	type Schedule,
} from "@aevryn/db";
import { and, asc, eq, isNull, lte } from "drizzle-orm";

export interface CreateScheduleInput {
	workspaceId: string;
	threadId: string;
	userId: string;
	cron?: string;
	intervalSeconds?: number;
	startAt?: Date;
	config?: Record<string, unknown>;
}

/**
 * Recurrence config, one per (workspace, thread) — the blessed home for the
 * `createSchedule` capability (`sched_` ULID, SCHEMA.md §18). Created by the
 * agent mid-run and fired by `schedule-tick` (thread/run trigger=schedule).
 */
export class ScheduleService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	/**
	 * Create or replace the thread's schedule. Unique (workspace, thread):
	 * re-calling createSchedule for the same thread updates the config and
	 * re-arms the timer instead of stacking duplicate schedules.
	 */
	async upsert(input: CreateScheduleInput): Promise<Schedule> {
		const now = new Date();
		const [row] = await this.scope()
			.insert(schedules)
			.values({
				id: ids.schedule(),
				workspaceId: input.workspaceId,
				threadId: input.threadId,
				userId: input.userId,
				cron: input.cron ?? null,
				intervalSeconds: input.intervalSeconds ?? null,
				nextRunAt: input.startAt ?? now,
				config: input.config ?? null,
				enabled: true,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [schedules.workspaceId, schedules.threadId],
				set: {
					userId: input.userId,
					cron: input.cron ?? null,
					intervalSeconds: input.intervalSeconds ?? null,
					nextRunAt: input.startAt ?? now,
					config: input.config ?? null,
					enabled: true,
					updatedAt: now,
				},
			})
			.returning();
		return row!;
	}

	async findById(id: string): Promise<Schedule | undefined> {
		return this.scope().query.schedules.findFirst({
			where: eq(schedules.id, id),
		});
	}

	async listByThread(threadId: string): Promise<Schedule[]> {
		return this.scope().query.schedules.findMany({
			where: eq(schedules.threadId, threadId),
			orderBy: [asc(schedules.createdAt)],
		});
	}

	async listByWorkspace(
		workspaceId: string,
		limit = 100,
	): Promise<Schedule[]> {
		return this.scope().query.schedules.findMany({
			where: and(
				eq(schedules.workspaceId, workspaceId),
				isNull(schedules.threadId),
			),
			orderBy: [asc(schedules.createdAt)],
			limit,
		});
	}

	/** Enabled schedules whose next fire time has arrived. */
	async listDue(now: Date): Promise<Schedule[]> {
		return this.scope().query.schedules.findMany({
			where: and(
				eq(schedules.enabled, true),
				lte(schedules.nextRunAt, now),
			),
		});
	}

	async setEnabled(id: string, enabled: boolean): Promise<Schedule | undefined> {
		const [row] = await this.scope()
			.update(schedules)
			.set({ enabled })
			.where(eq(schedules.id, id))
			.returning();
		return row;
	}

	async markRan(
		id: string,
		nextRunAt: Date,
		lastRunId: string,
	): Promise<Schedule | undefined> {
		const [row] = await this.scope()
			.update(schedules)
			.set({
				nextRunAt,
				lastRunId,
				lastRunAt: new Date(),
			})
			.where(eq(schedules.id, id))
			.returning();
		return row;
	}

	async delete(id: string): Promise<void> {
		await this.scope().delete(schedules).where(eq(schedules.id, id));
	}
}