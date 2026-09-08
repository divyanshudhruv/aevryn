import { db, type Event, event, ids } from "@aevryn/db";
import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateEventParams {
	workflowId?: string;
	executionId?: string;
	type: string;
	data: Event["data"];
}

export class EventRepository {
	async insert(
		params: CreateEventParams,
		client: DbClient = db,
	): Promise<Event> {
		const rows = await client
			.insert(event)
			.values({
				id: ids.event(),
				workflowId: params.workflowId,
				executionId: params.executionId,
				type: params.type,
				data: params.data,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Event insert returned no row");
		}
		return row;
	}

	async listByWorkflow(
		workflowId: string,
		limit = 100,
		client: DbClient = db,
	): Promise<Event[]> {
		return client
			.select()
			.from(event)
			.where(and(eq(event.workflowId, workflowId)))
			.orderBy(desc(event.occurredAt))
			.limit(limit);
	}
}
