import {
	db,
	ids,
	type RecoveryAttempt,
	type RecoveryStatus,
	recoveryAttempt,
} from "@aevryn/db";
import { and, count, eq } from "drizzle-orm";

import type { FailureClass } from "../recovery";
import type { DbClient } from "../types";

export interface CreateRecoveryAttemptParams {
	workflowId: string;
	executionId?: string;
	stepId?: string;
	failureClass: FailureClass;
	failureCode?: string;
	attempt: number;
	strategy?: string;
	result: RecoveryStatus;
	detail?: Record<string, unknown>;
}

export class RecoveryRepository {
	async insert(
		params: CreateRecoveryAttemptParams,
		client: DbClient = db,
	): Promise<RecoveryAttempt> {
		const rows = await client
			.insert(recoveryAttempt)
			.values({
				id: ids.recovery(),
				workflowId: params.workflowId,
				executionId: params.executionId,
				stepId: params.stepId,
				failureClass: params.failureClass,
				failureCode: params.failureCode,
				attempt: params.attempt,
				strategy: params.strategy,
				result: params.result,
				detail: params.detail,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Recovery attempt insert returned no row");
		}
		return row;
	}

	async countByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<number> {
		const rows = await client
			.select({ value: count() })
			.from(recoveryAttempt)
			.where(eq(recoveryAttempt.executionId, executionId));
		return rows[0]?.value ?? 0;
	}

	async updateResult(
		executionId: string,
		attempt: number,
		result: "completed" | "failed",
		detail?: Record<string, unknown>,
		client: DbClient = db,
	): Promise<void> {
		await client
			.update(recoveryAttempt)
			.set({ result, detail })
			.where(
				and(
					eq(recoveryAttempt.executionId, executionId),
					eq(recoveryAttempt.attempt, attempt),
				),
			);
	}

	async existsByExecutionAttempt(
		executionId: string,
		attempt: number,
		client: DbClient = db,
	): Promise<boolean> {
		const rows = await client
			.select({ id: recoveryAttempt.id })
			.from(recoveryAttempt)
			.where(
				and(
					eq(recoveryAttempt.executionId, executionId),
					eq(recoveryAttempt.attempt, attempt),
				),
			)
			.limit(1);
		return rows.length > 0;
	}

	async listByWorkflow(
		workflowId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<RecoveryAttempt[]> {
		return client
			.select()
			.from(recoveryAttempt)
			.where(eq(recoveryAttempt.workflowId, workflowId))
			.orderBy(recoveryAttempt.createdAt)
			.limit(limit);
	}
}
