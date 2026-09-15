import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	jsonb,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { messageRoleEnum } from "./enums";
import { threads } from "./thread";

const uuidText = sql`(concat('msg_', gen_random_uuid()::text))`;

export const messages = pgTable(
	"messages",
	{
		id: text("id").primaryKey().default(uuidText),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		role: messageRoleEnum("role").notNull(),
		content: text("content").notNull().default(""),
		/** Full UIMessage parts (text + tool calls + client-tool answers +
		 *  approvals) persisted at stream end so replay restores the exact
		 *  timeline — QuestionFlow cards, plan accordions, system events. */
		parts: jsonb("parts").$type<unknown[]>(),
		usage: jsonb("usage").$type<{
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
		}>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [authUsers.id],
		}).onDelete("cascade"),
		index("messages_thread_created_idx").on(table.threadId, table.createdAt),
		pgPolicy("messages_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("messages_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("messages_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("messages_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
