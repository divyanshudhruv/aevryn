import {
	type ApprovalRequest,
	approvalRequests,
	type Db,
	db,
	ids,
} from "@aevryn/db";
import { and, desc, eq } from "drizzle-orm";

export interface CreateApprovalInput {
	runId: string;
	userId: string;
	toolName: string;
	input?: unknown;
	schema?: unknown;
	threadId?: string;
	workflowId?: string;
}

export class ApprovalService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async create(input: CreateApprovalInput): Promise<ApprovalRequest> {
		const [row] = await this.scope()
			.insert(approvalRequests)
			.values({
				id: ids.approvalRequest(),
				runId: input.runId,
				userId: input.userId,
				toolName: input.toolName,
				input: (input.input as never) ?? null,
				schema: (input.schema as never) ?? null,
				threadId: input.threadId ?? null,
				workflowId: input.workflowId ?? null,
				status: "pending",
				autoApproved: false,
			})
			.returning();
		return row!;
	}

	async findById(id: string): Promise<ApprovalRequest | undefined> {
		return this.scope().query.approvalRequests.findFirst({
			where: eq(approvalRequests.id, id),
		});
	}

	async listPendingForRun(runId: string): Promise<ApprovalRequest[]> {
		return this.scope().query.approvalRequests.findMany({
			where: and(
				eq(approvalRequests.runId, runId),
				eq(approvalRequests.status, "pending"),
			),
			orderBy: [desc(approvalRequests.createdAt)],
		});
	}

	async listPendingForThread(threadId: string): Promise<ApprovalRequest[]> {
		return this.scope().query.approvalRequests.findMany({
			where: and(
				eq(approvalRequests.threadId, threadId),
				eq(approvalRequests.status, "pending"),
			),
			orderBy: [desc(approvalRequests.createdAt)],
		});
	}

	async resolve(
		id: string,
		status: "approved" | "denied",
		autoApproved = false,
	): Promise<ApprovalRequest | undefined> {
		const [row] = await this.scope()
			.update(approvalRequests)
			.set({
				status,
				autoApproved,
				resolvedAt: new Date(),
			})
			.where(eq(approvalRequests.id, id))
			.returning();
		return row;
	}

	async markAutoApproved(id: string): Promise<ApprovalRequest | undefined> {
		return this.resolve(id, "approved", true);
	}

	async countPending(threadId: string): Promise<number> {
		const rows = await this.scope().query.approvalRequests.findMany({
			where: and(
				eq(approvalRequests.threadId, threadId),
				eq(approvalRequests.status, "pending"),
			),
		});
		return rows.length;
	}
}
