import {
	db,
	ids,
	type NewToolExecution,
	type ToolExecution,
	toolExecution,
} from "@aevryn/db";
import { and, asc, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface ToolExecutionUpsertRow {
	workflowId: string;
	executionId: string;
	order: number;
	stepId?: string | null;
	tool: string;
	provider?: string;
	status: NewToolExecution["status"];
	input: NewToolExecution["input"];
	output?: NewToolExecution["output"];
	errorCode?: string;
	durationMs?: number;
}

export class ToolExecutionRepository {
	/**
	 * Insert a tool execution row or update it when a row for the same
	 * (execution, order) already exists. Idempotent across inngest retries.
	 */
	async upsertByOrder(
		row: ToolExecutionUpsertRow,
		client: DbClient = db,
	): Promise<boolean> {
		const [result] = await client
			.insert(toolExecution)
			.values({
				id: ids.tool(),
				workflowId: row.workflowId,
				executionId: row.executionId,
				order: row.order,
				stepId: row.stepId ?? null,
				tool: row.tool,
				provider: row.provider,
				status: row.status,
				input: row.input,
				output: row.output,
				errorCode: row.errorCode,
				durationMs: row.durationMs,
			})
			.onConflictDoUpdate({
				target: [toolExecution.executionId, toolExecution.order],
				set: {
					workflowId: row.workflowId,
					stepId: row.stepId ?? null,
					tool: row.tool,
					provider: row.provider,
					status: row.status,
					input: row.input,
					output: row.output,
					errorCode: row.errorCode,
					durationMs: row.durationMs,
					updatedAt: new Date(),
				},
			})
			.returning();
		return result != null;
	}

	async upsertManyByOrder(
		rows: ToolExecutionUpsertRow[],
		client: DbClient = db,
	): Promise<void> {
		for (const row of rows) {
			await this.upsertByOrder(row, client);
		}
	}

	async listByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<ToolExecution[]> {
		return client
			.select()
			.from(toolExecution)
			.where(and(eq(toolExecution.executionId, executionId)))
			.orderBy(asc(toolExecution.order));
	}
}
