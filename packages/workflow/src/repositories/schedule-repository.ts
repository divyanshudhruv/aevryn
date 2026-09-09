import { db, ids, type NewSchedule, type Schedule, schedule } from "@aevryn/db";
import { and, asc, desc, eq, lte } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateScheduleParams {
	workflowId: string;
	cron?: string;
	intervalSeconds?: number;
	nextRunAt: Date;
	config?: NewSchedule["config"];
}

export type ScheduleUpdate = Partial<
	Pick<
		Schedule,
		"cron" | "intervalSeconds" | "nextRunAt" | "lastRunAt" | "enabled"
	>
>;

export class ScheduleRepository {
	async insert(
		params: CreateScheduleParams,
		client: DbClient = db,
	): Promise<Schedule> {
		const rows = await client
			.insert(schedule)
			.values({
				id: ids.schedule(),
				workflowId: params.workflowId,
				cron: params.cron,
				intervalSeconds: params.intervalSeconds,
				nextRunAt: params.nextRunAt,
				enabled: 1,
				config: params.config,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Schedule insert returned no row");
		}
		return row;
	}

	async findById(id: string, client: DbClient = db): Promise<Schedule | null> {
		const rows = await client
			.select()
			.from(schedule)
			.where(eq(schedule.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async update(
		id: string,
		update: ScheduleUpdate,
		client: DbClient = db,
	): Promise<Schedule> {
		const rows = await client
			.update(schedule)
			.set(update)
			.where(eq(schedule.id, id))
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error(`Schedule not found: ${id}`);
		}
		return row;
	}

	/**
	 * Schedules whose next run time has passed and which are still enabled.
	 * Used by the schedule-tick function to enqueue durable executions.
	 */
	async findDue(now: Date, client: DbClient = db): Promise<Schedule[]> {
		return client
			.select()
			.from(schedule)
			.where(and(eq(schedule.enabled, 1), lte(schedule.nextRunAt, now)))
			.orderBy(asc(schedule.nextRunAt))
			.limit(50);
	}

	async listByWorkflow(
		workflowId: string,
		client: DbClient = db,
	): Promise<Schedule[]> {
		return client
			.select()
			.from(schedule)
			.where(eq(schedule.workflowId, workflowId))
			.orderBy(desc(schedule.createdAt));
	}

	async listEnabledByWorkflow(
		workflowId: string,
		client: DbClient = db,
	): Promise<Schedule[]> {
		return client
			.select()
			.from(schedule)
			.where(and(eq(schedule.workflowId, workflowId), eq(schedule.enabled, 1)))
			.orderBy(desc(schedule.createdAt));
	}

	async setEnabled(
		id: string,
		enabled: boolean,
		client: DbClient = db,
	): Promise<Schedule> {
		return this.update(id, { enabled: enabled ? 1 : 0 }, client);
	}

	async delete(id: string, client: DbClient = db): Promise<void> {
		await client.delete(schedule).where(eq(schedule.id, id));
	}
}
