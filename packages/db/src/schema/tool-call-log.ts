import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	jsonb,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import type { ToolCallLogDirection, ToolCallLogStatus } from "../domain";
import { messages } from "./message";
import { threads } from "./thread";

const tlIdDefault = sql`(concat('tl_', gen_random_uuid()::text))`;

export const toolCallLogs = pgTable(
	"tool_call_logs",
	{
		id: text("id").primaryKey().default(tlIdDefault).notNull(),
		messageId: text("message_id"),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		stepId: text("step_id"),
		userId: uuid("user_id")
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		toolName: text("tool_name").notNull(),
		toolCallId: text("tool_call_id").notNull(),
		direction: text("direction").$type<ToolCallLogDirection>().notNull(),
		input: jsonb("input"),
		output: jsonb("output"),
		error: jsonb("error"),
		status: text("status").$type<ToolCallLogStatus>().notNull(),
		startedAt: timestamp("started_at", { mode: "date" })
			.notNull()
			.default(sql`now()`),
		endedAt: timestamp("ended_at", { mode: "date" }),
		durationMs: integer("duration_ms"),
		tokens: jsonb("tokens"),
		chainStack: jsonb("chain_stack"),
	},
	(table) => [
		foreignKey({
			columns: [table.messageId],
			foreignColumns: [messages.id],
		}).onDelete("cascade"),
		uniqueIndex("tool_call_logs_message_tool_call_id_unique").on(
			table.messageId,
			table.toolCallId,
		),
		index("tool_call_logs_thread_started_at_index").on(
			table.threadId,
			table.startedAt,
		),
		pgPolicy("tool_call_logs_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("tool_call_logs_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("tool_call_logs_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("tool_call_logs_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type ToolCallLog = typeof toolCallLogs.$inferSelect;
export type ToolCallLogInput = typeof toolCallLogs.$inferInsert;
