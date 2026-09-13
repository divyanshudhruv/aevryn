import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('sched_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { runs } from "./run";
import { threads } from "./thread";
import { workspaces } from "./workspace";

export const schedules = pgTable(
	"schedules",
	{
		id: text("id").primaryKey().default(uuidText),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		cron: text("cron"),
		intervalSeconds: integer("interval_seconds"),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }),
		lastRunId: text("last_run_id").references(() => runs.id, {
			onDelete: "set null",
		}),
		enabled: boolean("enabled").notNull().default(true),
		config: jsonb("config"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("schedules_workspace_thread_idx").on(
			table.workspaceId,
			table.threadId,
		),
		index("schedules_enabled_next_run_idx").on(table.enabled, table.nextRunAt),
		pgPolicy("schedules_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("schedules_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("schedules_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("schedules_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;