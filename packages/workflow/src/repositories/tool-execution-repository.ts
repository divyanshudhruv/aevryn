import {
	db,
	ids,
	type NewToolExecution,
	type ToolExecution,
	toolExecution,
} from "@aevryn/db";
import { and, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateToolExecutionRow {
	workflowId: string;
	executionId: string;
	stepId: string;
	tool: string;
	provider?: string;
	status: NewToolExecution["status"];
	input: NewToolExecution["input"];
	output?: NewToolExecution["output"];
	errorCode?: string;
	durationMs?: number;
}

export class ToolExecutionRepository {
	async insertMany(
		params: CreateToolExecutionRow[],
		client: DbClient = db,
	): Promise<ToolExecution[]> {
		if (params.length === 0) {
			return [];
		}
		return client
			.insert(toolExecution)
			.values(
				params.map((record) => ({
					id: ids.tool(),
					workflowId: record.workflowId,
					executionId: record.executionId,
					stepId: record.stepId,
					tool: record.tool,
					provider: record.provider,
					status: record.status,
					input: record.input,
					output: record.output,
					errorCode: record.errorCode,
					durationMs: record.durationMs,
				})),
			)
			.returning();
	}

	async listByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<ToolExecution[]> {
		return client
			.select()
			.from(toolExecution)
			.where(and(eq(toolExecution.executionId, executionId)));
	}
}
