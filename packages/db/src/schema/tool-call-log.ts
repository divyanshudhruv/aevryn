import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ToolCallLogDirection, ToolCallLogStatus } from "../domain";

export const toolCallLogs = pgTable(
	"tool_call_logs",
	{
		id: text("id").primaryKey().notNull(),
		messageId: text("message_id").notNull(),
		threadId: text("thread_id").notNull(),
		stepId: text("step_id"),
		userId: text("user_id").notNull(),
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
		uniqueIndex("tool_call_logs_message_tool_call_id_unique").on(
			table.messageId,
			table.toolCallId,
		),
		index("tool_call_logs_thread_started_at_index").on(
			table.threadId,
			table.startedAt,
		),
	],
);

export type ToolCallLog = typeof toolCallLogs.$inferSelect;
export type ToolCallLogInput = typeof toolCallLogs.$inferInsert;