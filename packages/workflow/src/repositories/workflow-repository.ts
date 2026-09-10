import { db, ids, type NewWorkflow, type Workflow, workflow } from "@aevryn/db";
import { and, desc, eq } from "drizzle-orm";

import { WorkflowNotFoundError } from "../errors";
import type { DbClient } from "../types";

export interface CreateWorkflowParams {
	userId: string;
	objective: string;
}

export class WorkflowRepository {
	async insert(
		params: CreateWorkflowParams,
		client: DbClient = db,
	): Promise<Workflow> {
		const rows = await client
			.insert(workflow)
			.values({
				id: ids.workflow(),
				userId: params.userId,
				objective: params.objective,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Workflow insert returned no row");
		}
		return row;
	}

	async findById(id: string, client: DbClient = db): Promise<Workflow | null> {
		const rows = await client
			.select()
			.from(workflow)
			.where(eq(workflow.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async requireById(id: string, client: DbClient = db): Promise<Workflow> {
		const row = await this.findById(id, client);
		if (!row) {
			throw new WorkflowNotFoundError(id);
		}
		return row;
	}

	async findOwnedByUser(
		userId: string,
		id: string,
		client: DbClient = db,
	): Promise<Workflow | null> {
		const rows = await client
			.select()
			.from(workflow)
			.where(and(eq(workflow.id, id), eq(workflow.userId, userId)))
			.limit(1);
		return rows[0] ?? null;
	}

	async setStatus(
		id: string,
		status: NewWorkflow["status"],
		client: DbClient = db,
	): Promise<Workflow> {
		const rows = await client
			.update(workflow)
			.set({ status })
			.where(eq(workflow.id, id))
			.returning();
		if (!rows[0]) {
			throw new WorkflowNotFoundError(id);
		}
		return rows[0];
	}

	async setObjective(
		id: string,
		objective: string,
		client: DbClient = db,
	): Promise<Workflow> {
		const rows = await client
			.update(workflow)
			.set({ objective })
			.where(eq(workflow.id, id))
			.returning();
		if (!rows[0]) {
			throw new WorkflowNotFoundError(id);
		}
		return rows[0];
	}

	async setCustomPrompt(
		id: string,
		prompt: string | null,
		client: DbClient = db,
	): Promise<Workflow> {
		const rows = await client
			.update(workflow)
			.set({ customPrompt: prompt })
			.where(eq(workflow.id, id))
			.returning();
		if (!rows[0]) {
			throw new WorkflowNotFoundError(id);
		}
		return rows[0];
	}

	async listByUser(
		userId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<Workflow[]> {
		return client
			.select()
			.from(workflow)
			.where(eq(workflow.userId, userId))
			.orderBy(desc(workflow.createdAt))
			.limit(limit);
	}

	/** Hard delete. Child rows (executions, steps, approvals, events, states,
	 *  recovery attempts, tool executions, schedules, observations, webhook
	 *  boards) are removed by ON DELETE CASCADE. */
	async delete(id: string, client: DbClient = db): Promise<void> {
		await client.delete(workflow).where(eq(workflow.id, id));
	}
}
