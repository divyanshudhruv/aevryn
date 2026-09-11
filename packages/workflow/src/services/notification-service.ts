import {
	type Db,
	db,
	ids,
	type Notification,
	type NotificationType,
	notifications,
} from "@aevryn/db";
import { and, count, desc, eq, isNull } from "drizzle-orm";

export interface CreateNotificationInput {
	userId: string;
	workspaceId: string;
	threadId?: string;
	type: NotificationType;
	title: string;
	body?: string;
}

export class NotificationService {
	constructor(private readonly client: Db = db) {}

	private scope(): Db {
		return this.client;
	}

	async create(input: CreateNotificationInput): Promise<Notification> {
		const [row] = await this.scope()
			.insert(notifications)
			.values({
				id: ids.notification(),
				userId: input.userId,
				workspaceId: input.workspaceId,
				threadId: input.threadId ?? null,
				type: input.type,
				title: input.title,
				body: input.body ?? "",
			})
			.returning();
		return row!;
	}

	async listForUser(userId: string, limit = 50): Promise<Notification[]> {
		return this.scope().query.notifications.findMany({
			where: eq(notifications.userId, userId),
			orderBy: [desc(notifications.createdAt)],
			limit,
		});
	}

	async listUnread(userId: string, limit = 50): Promise<Notification[]> {
		return this.scope().query.notifications.findMany({
			where: and(
				eq(notifications.userId, userId),
				isNull(notifications.readAt),
			),
			orderBy: [desc(notifications.createdAt)],
			limit,
		});
	}

	async unreadCount(userId: string): Promise<number> {
		const [row] = await this.scope()
			.select({ value: count() })
			.from(notifications)
			.where(
				and(eq(notifications.userId, userId), isNull(notifications.readAt)),
			);
		return Number(row?.value ?? 0);
	}

	async markRead(
		id: string,
		userId: string,
	): Promise<Notification | undefined> {
		const [row] = await this.scope()
			.update(notifications)
			.set({ readAt: new Date() })
			.where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
			.returning();
		return row;
	}

	async markAllRead(userId: string): Promise<void> {
		await this.scope()
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(eq(notifications.userId, userId), isNull(notifications.readAt)),
			);
	}

	async delete(id: string, userId: string): Promise<void> {
		await this.scope()
			.delete(notifications)
			.where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
	}
}
