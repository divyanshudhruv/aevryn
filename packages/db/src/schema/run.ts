import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
	bigint,
	index,
	jsonb,
	numeric,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { runStatusEnum, runTriggerEnum } from "./enums";
import { canEditThread, canReadThread } from "./policies";
import { threads } from "./thread";

export const runs = pgTable(
	"runs",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		workflowId: text("workflow_id"),
		userId: uuid("user_id").notNull(),
		trigger: runTriggerEnum("trigger").notNull(),
		rerunOf: text("rerun_of").references((): AnyPgColumn => runs.id, {
			onDelete: "set null",
		}),
		status: runStatusEnum("status").notNull().default("pending"),
		promptSnapshot: jsonb("prompt_snapshot"),
		costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
		tokenCount: bigint("token_count", { mode: "number" }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("runs_thread_created_idx").on(table.threadId, table.createdAt),
		index("runs_workflow_status_idx").on(table.workflowId, table.status),
		pgPolicy("runs_select", {
			for: "select",
			to: authenticatedRole,
			using: canReadThread(table.threadId),
		}),
		pgPolicy("runs_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: canReadThread(table.threadId),
		}),
		pgPolicy("runs_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${canEditThread(table.threadId)}`,
		}),
		pgPolicy("runs_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;