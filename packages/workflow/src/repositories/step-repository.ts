import {
	db,
	ids,
	type NewWorkflowStep,
	type WorkflowStep,
	workflowStep,
} from "@aevryn/db";
import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateStepRow {
	executionId: string;
	kind: string;
	status: NewWorkflowStep["status"];
	order?: number;
	startedAt?: Date;
	completedAt?: Date;
}

export class StepRepository {
	async insertMany(
		params: CreateStepRow[],
		client: DbClient = db,
	): Promise<WorkflowStep[]> {
		if (params.length === 0) {
			return [];
		}
		return client
			.insert(workflowStep)
			.values(
				params.map((step, index) => ({
					id: ids.step(),
					executionId: step.executionId,
					kind: step.kind,
					status: step.status,
					order: step.order ?? index,
					startedAt: step.startedAt,
					completedAt: step.completedAt,
				})),
			)
			.returning();
	}

	async listByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<WorkflowStep[]> {
		return client
			.select()
			.from(workflowStep)
			.where(and(eq(workflowStep.executionId, executionId)))
			.orderBy(desc(workflowStep.createdAt));
	}
}
