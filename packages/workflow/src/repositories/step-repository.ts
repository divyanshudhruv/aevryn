import {
	db,
	ids,
	type NewWorkflowStep,
	type WorkflowStep,
	workflowStep,
} from "@aevryn/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateStepRow {
	executionId: string;
	kind: string;
	assistantText?: string | null;
	status: NewWorkflowStep["status"];
	order?: number;
	startedAt?: Date;
	completedAt?: Date;
	idempotencyKey?: string | null;
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
					assistantText: step.assistantText,
					status: step.status,
					order: step.order ?? index,
					startedAt: step.startedAt,
					completedAt: step.completedAt,
					idempotencyKey: step.idempotencyKey,
				})),
			)
			.returning();
	}

	async insertOne(
		params: CreateStepRow,
		client: DbClient = db,
	): Promise<WorkflowStep> {
		const rows = await this.insertMany([params], client);
		const row = rows[0];
		if (!row) {
			throw new Error("Step insert returned no row");
		}
		return row;
	}

	/** Highest `order` value currently stored for the execution, or -1 when
	 *  the execution has no steps yet. */
	async maxOrderByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<number> {
		const rows = await client
			.select({ max: sql<number>`max(${workflowStep.order})` })
			.from(workflowStep)
			.where(eq(workflowStep.executionId, executionId));
		return rows[0]?.max ?? -1;
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

	async listByExecutionAscending(
		executionId: string,
		client: DbClient = db,
	): Promise<WorkflowStep[]> {
		return client
			.select()
			.from(workflowStep)
			.where(and(eq(workflowStep.executionId, executionId)))
			.orderBy(asc(workflowStep.order), asc(workflowStep.createdAt));
	}
}
