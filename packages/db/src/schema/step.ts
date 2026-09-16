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

import type { StepToolStatus } from "../domain";
import { messages } from "./message";

const uuidText = sql`(concat('stp_', gen_random_uuid()::text))`;


export interface StepToolCall {
	toolCallId: string;
	toolName: string;
	input: unknown;
	output?: unknown;
	status: StepToolStatus;
	error?: { code: string; message: string };
	startedAt: string;
	endedAt?: string;
	detail?: unknown;
}

export const steps = pgTable(
	"steps",
	{
		id: text("id").primaryKey().default(uuidText),
		messageId: text("message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
				threadId: text("thread_id").notNull(),
		userId: uuid("user_id").notNull(),
		position: integer("position").notNull(),
		text: text("text"),
		toolCalls: jsonb("tool_calls").$type<StepToolCall[]>().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [authUsers.id],
		}).onDelete("cascade"),
		index("steps_thread_position_idx").on(table.threadId, table.position),
		uniqueIndex("steps_message_position_unique").on(
			table.messageId,
			table.position,
		),
		pgPolicy("steps_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("steps_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("steps_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("steps_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Step = typeof steps.$inferSelect;
export type NewStep = typeof steps.$inferInsert;
