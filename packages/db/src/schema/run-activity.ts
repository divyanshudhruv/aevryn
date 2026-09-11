import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { activityStatusEnum, activityTypeEnum } from "./enums";
import { canReadThread } from "./policies";
import { runs } from "./run";

export const runActivities = pgTable(
	"run_activities",
	{
		id: text("id").primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => runs.id, { onDelete: "cascade" }),
		parentId: text("parent_id").references((): AnyPgColumn => runActivities.id, {
			onDelete: "set null",
		}),
		type: activityTypeEnum("type").notNull(),
		status: activityStatusEnum("status").notNull().default("pending"),
		stepLabel: text("step_label"),
		title: text("title"),
		description: text("description"),
		detail: jsonb("detail"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("run_activities_run_created_idx").on(table.runId, table.createdAt),
		pgPolicy("run_activities_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`exists (select 1 from "runs" r where r."id" = ${table.runId} and ${canReadThread(sql`r."thread_id"`)})`,
		}),
	],
).enableRLS();

export type RunActivity = typeof runActivities.$inferSelect;
export type NewRunActivity = typeof runActivities.$inferInsert;