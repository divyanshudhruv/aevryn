import {
	db,
	ids,
	type WebhookBoard,
	type WebhookStatus,
	webhookBoard,
} from "@aevryn/db";
import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateWebhookParams {
	workflowId: string;
	executionId?: string;
	tokenHash: string;
	instruction: string;
	expiresAt?: Date;
}

export class WebhookRepository {
	async insert(
		params: CreateWebhookParams,
		client: DbClient = db,
	): Promise<WebhookBoard> {
		const rows = await client
			.insert(webhookBoard)
			.values({
				id: ids.webhook(),
				workflowId: params.workflowId,
				executionId: params.executionId,
				tokenHash: params.tokenHash,
				instruction: params.instruction,
				status: "active",
				expiresAt: params.expiresAt,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Webhook insert returned no row");
		}
		return row;
	}

	async findByTokenHash(
		tokenHash: string,
		client: DbClient = db,
	): Promise<WebhookBoard | null> {
		const rows = await client
			.select()
			.from(webhookBoard)
			.where(eq(webhookBoard.tokenHash, tokenHash))
			.limit(1);
		return rows[0] ?? null;
	}

	async updateStatus(
		id: string,
		status: WebhookStatus,
		usedAt?: Date,
		client: DbClient = db,
	): Promise<WebhookBoard> {
		const rows = await client
			.update(webhookBoard)
			.set({ status, usedAt })
			.where(eq(webhookBoard.id, id))
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error(`Webhook not found: ${id}`);
		}
		return row;
	}

	async listByWorkflow(
		workflowId: string,
		limit = 20,
		client: DbClient = db,
	): Promise<WebhookBoard[]> {
		return client
			.select()
			.from(webhookBoard)
			.where(and(eq(webhookBoard.workflowId, workflowId)))
			.orderBy(desc(webhookBoard.createdAt))
			.limit(limit);
	}
}
