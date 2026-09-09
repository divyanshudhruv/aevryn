import {
	db,
	type EventData,
	ids,
	type Notification,
	notification,
} from "@aevryn/db";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import type { DbClient } from "../types";

export interface CreateNotificationParams {
	userId: string;
	workflowId?: string;
	type: string;
	channel: string;
	subject?: string;
	body?: EventData;
}

export class NotificationRepository {
	async insert(
		params: CreateNotificationParams,
		client: DbClient = db,
	): Promise<Notification> {
		const rows = await client
			.insert(notification)
			.values({
				id: ids.notification(),
				userId: params.userId,
				workflowId: params.workflowId,
				type: params.type,
				channel: params.channel,
				subject: params.subject,
				body: params.body,
			})
			.returning();
		const row = rows[0];
		if (!row) {
			throw new Error("Notification insert returned no row");
		}
		return row;
	}

	async listByWorkflow(
		workflowId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<Notification[]> {
		return client
			.select()
			.from(notification)
			.where(eq(notification.workflowId, workflowId))
			.orderBy(desc(notification.createdAt))
			.limit(limit);
	}

	async listByUser(
		userId: string,
		limit = 50,
		client: DbClient = db,
	): Promise<Notification[]> {
		return client
			.select()
			.from(notification)
			.where(eq(notification.userId, userId))
			.orderBy(desc(notification.createdAt))
			.limit(limit);
	}

	async listUndelivered(
		userId: string,
		client: DbClient = db,
	): Promise<Notification[]> {
		return client
			.select()
			.from(notification)
			.where(
				and(eq(notification.userId, userId), isNull(notification.deliveredAt)),
			)
			.orderBy(asc(notification.createdAt))
			.limit(50);
	}

	async findById(
		id: string,
		client: DbClient = db,
	): Promise<Notification | null> {
		const rows = await client
			.select()
			.from(notification)
			.where(eq(notification.id, id))
			.limit(1);
		return rows[0] ?? null;
	}

	async markDelivered(id: string, client: DbClient = db): Promise<void> {
		await client
			.update(notification)
			.set({ deliveredAt: new Date() })
			.where(eq(notification.id, id));
	}

	async markRead(
		id: string,
		userId: string,
		client: DbClient = db,
	): Promise<void> {
		await client
			.update(notification)
			.set({ readAt: new Date() })
			.where(and(eq(notification.id, id), eq(notification.userId, userId)));
	}

	async markReadMany(
		ids: string[],
		userId: string,
		client: DbClient = db,
	): Promise<void> {
		if (ids.length === 0) {
			return;
		}
		await client
			.update(notification)
			.set({ readAt: new Date() })
			.where(
				and(inArray(notification.id, ids), eq(notification.userId, userId)),
			);
	}

	async markAllRead(userId: string, client: DbClient = db): Promise<void> {
		await client
			.update(notification)
			.set({ readAt: new Date() })
			.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
	}

	async countUnread(userId: string, client: DbClient = db): Promise<number> {
		const rows = await client
			.select({ value: count() })
			.from(notification)
			.where(and(eq(notification.userId, userId), isNull(notification.readAt)));
		return rows[0]?.value ?? 0;
	}
}
