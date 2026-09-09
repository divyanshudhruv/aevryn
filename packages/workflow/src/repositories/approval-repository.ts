import {
	type Approval,
	type ApprovalStatus,
	approval,
	db,
	ids,
} from "@aevryn/db";
import { and, asc, desc, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateApprovalParams {
	workflowId: string;
	executionId?: string;
	userId: string;
	toolName: string;
	input: Record<string, unknown>;
}

export class ApprovalRepository {
	async insert(
		params: CreateApprovalParams,
		client: DbClient = db,
	): Promise<Approval> {
		const rows = await client
			.insert(approval)
			.values({
				id: ids.approval(),
				workflowId: params.workflowId,
				executionId: params.executionId,
				userId: params.userId,
				toolName: params.toolName,
				input: params.input,
				status: "pending",
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Approval insert returned no row");
		}
		return row;
	}

	async findById(id: string, client: DbClient = db): Promise<Approval | null> {
		const rows = await client
			.select()
			.from(approval)
			.where(eq(approval.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async existsPendingForExecution(
		executionId: string,
		toolName: string,
		client: DbClient = db,
	): Promise<boolean> {
		const rows = await client
			.select({ id: approval.id })
			.from(approval)
			.where(
				and(
					eq(approval.executionId, executionId),
					eq(approval.toolName, toolName),
					eq(approval.status, "pending"),
				),
			)
			.limit(1);
		return rows.length > 0;
	}

	async listByWorkflow(
		workflowId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<Approval[]> {
		return client
			.select()
			.from(approval)
			.where(eq(approval.workflowId, workflowId))
			.orderBy(desc(approval.createdAt))
			.limit(limit);
	}

	async listPendingByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<Approval[]> {
		return client
			.select()
			.from(approval)
			.where(
				and(
					eq(approval.executionId, executionId),
					eq(approval.status, "pending"),
				),
			)
			.orderBy(asc(approval.createdAt));
	}

	async countPendingByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<number> {
		const rows = await client
			.select({ id: approval.id })
			.from(approval)
			.where(
				and(
					eq(approval.executionId, executionId),
					eq(approval.status, "pending"),
				),
			);
		return rows.length;
	}

	async countPendingByWorkflow(
		workflowId: string,
		client: DbClient = db,
	): Promise<number> {
		const rows = await client
			.select({ id: approval.id })
			.from(approval)
			.where(
				and(
					eq(approval.workflowId, workflowId),
					eq(approval.status, "pending"),
				),
			);
		return rows.length;
	}

	async listApprovedByExecution(
		executionId: string,
		client: DbClient = db,
	): Promise<Approval[]> {
		return client
			.select()
			.from(approval)
			.where(
				and(
					eq(approval.executionId, executionId),
					eq(approval.status, "approved"),
				),
			)
			.orderBy(asc(approval.createdAt));
	}

	async setStatus(
		id: string,
		status: ApprovalStatus,
		reason?: string,
		client: DbClient = db,
	): Promise<Approval | null> {
		const rows = await client
			.update(approval)
			.set({
				status,
				reason: reason ?? null,
				decidedAt: new Date(),
			})
			.where(eq(approval.id, id))
			.returning();
		return rows[0] ?? null;
	}
}
