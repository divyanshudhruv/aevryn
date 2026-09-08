import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import type { eventDataSchema } from "../zod";
import { user } from "./auth";
import { workflow } from "./workflow";

export const notification = pgTable(
	"notification",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		workflowId: text("workflow_id").references(() => workflow.id, {
			onDelete: "set null",
		}),
		type: text("type").notNull(),
		channel: text("channel").notNull(),
		subject: text("subject"),
		body: jsonb("body").$type<z.input<typeof eventDataSchema>>(),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("notification_user_created_idx").on(table.userId, table.createdAt),
		index("notification_user_delivered_idx").on(
			table.userId,
			table.deliveredAt,
		),
		index("notification_workflow_idx").on(table.workflowId),
	],
);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
