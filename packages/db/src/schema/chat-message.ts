import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('msg_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { messageRoleEnum, messageStatusEnum } from "./enums";
import { canEditThread, canReadThread } from "./policies";
import { threads } from "./thread";

export const chatMessages = pgTable(
	"chat_messages",
	{
		id: text("id").primaryKey().default(uuidText),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		role: messageRoleEnum("role").notNull(),
		content: jsonb("content").notNull(),
		runId: text("run_id"),
		status: messageStatusEnum("status").notNull().default("completed"),
		queueOrder: integer("queue_order"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("chat_messages_thread_created_idx").on(table.threadId, table.createdAt),
		index("chat_messages_thread_status_idx").on(table.threadId, table.status),
		pgPolicy("chat_messages_select", {
			for: "select",
			to: authenticatedRole,
			using: canReadThread(table.threadId),
		}),
		pgPolicy("chat_messages_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: canReadThread(table.threadId),
		}),
		pgPolicy("chat_messages_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${canEditThread(table.threadId)}`,
		}),
		pgPolicy("chat_messages_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;