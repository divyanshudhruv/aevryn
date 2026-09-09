import {
	db,
	ids,
	type Observation,
	type ObservationContent,
	observation,
} from "@aevryn/db";
import { desc, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateObservationParams {
	workflowId: string;
	type: string;
	content: ObservationContent;
}

export class ObservationRepository {
	async insert(
		params: CreateObservationParams,
		client: DbClient = db,
	): Promise<Observation> {
		const rows = await client
			.insert(observation)
			.values({
				id: ids.observation(),
				workflowId: params.workflowId,
				type: params.type,
				content: params.content,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Observation insert returned no row");
		}
		return row;
	}

	async listByWorkflow(
		workflowId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<Observation[]> {
		return client
			.select()
			.from(observation)
			.where(eq(observation.workflowId, workflowId))
			.orderBy(desc(observation.observedAt))
			.limit(limit);
	}
}
