import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { notificationTypeEnum } from "./enums";
import { threads } from "./thread";
import { workspaces } from "./workspace";

export const notifications = pgTable(
	"notifications",
	{
		id: text("id").primaryKey(),
		userId: uuid("user_id").notNull(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		type: notificationTypeEnum("type").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull().default(""),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("notifications_user_read_created_idx").on(
			table.userId,
			table.readAt,
			table.createdAt,
		),
		pgPolicy("notifications_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("notifications_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("notifications_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("notifications_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;