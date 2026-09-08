import {
	db,
	ids,
	type NewWorkflowExecution,
	type WorkflowExecution,
	workflowExecution,
} from "@aevryn/db";
import { and, asc, desc, eq } from "drizzle-orm";

import { ExecutionNotFoundError } from "../errors";
import type { DbClient } from "../types";

export interface CreateExecutionParams {
	workflowId: string;
	status?: NewWorkflowExecution["status"];
	startedAt?: Date;
	prompt?: string;
}

export interface UpdateExecutionParams {
	status: NewWorkflowExecution["status"];
	reason?: string;
	startedAt?: Date;
	completedAt?: Date;
}

export class ExecutionRepository {
	async insert(
		params: CreateExecutionParams,
		client: DbClient = db,
	): Promise<WorkflowExecution> {
		const rows = await client
			.insert(workflowExecution)
			.values({
				id: ids.execution(),
				workflowId: params.workflowId,
				status: params.status,
				startedAt: params.startedAt,
				prompt: params.prompt ?? "",
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Execution insert returned no row");
		}
		return row;
	}

	async findById(
		id: string,
		client: DbClient = db,
	): Promise<WorkflowExecution | null> {
		const rows = await client
			.select()
			.from(workflowExecution)
			.where(eq(workflowExecution.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async requireById(
		id: string,
		client: DbClient = db,
	): Promise<WorkflowExecution> {
		const row = await this.findById(id, client);
		if (!row) {
			throw new ExecutionNotFoundError(id);
		}
		return row;
	}

	async update(
		id: string,
		params: UpdateExecutionParams,
		client: DbClient = db,
	): Promise<WorkflowExecution> {
		const rows = await client
			.update(workflowExecution)
			.set({
				status: params.status,
				reason: params.reason,
				startedAt: params.startedAt,
				completedAt: params.completedAt,
			})
			.where(eq(workflowExecution.id, id))
			.returning();
		if (!rows[0]) {
			throw new ExecutionNotFoundError(id);
		}
		return rows[0];
	}

	async listByWorkflow(
		workflowId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<WorkflowExecution[]> {
		return client
			.select()
			.from(workflowExecution)
			.where(and(eq(workflowExecution.workflowId, workflowId)))
			.orderBy(desc(workflowExecution.createdAt))
			.limit(limit);
	}

	async listByWorkflowChronological(
		workflowId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<WorkflowExecution[]> {
		return client
			.select()
			.from(workflowExecution)
			.where(and(eq(workflowExecution.workflowId, workflowId)))
			.orderBy(asc(workflowExecution.createdAt))
			.limit(limit);
	}
}
