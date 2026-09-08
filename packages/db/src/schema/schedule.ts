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
import { workflow } from "./workflow";

export const schedule = pgTable(
	"schedule",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		cron: text("cron"),
		intervalSeconds: integer("interval_seconds"),
		nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
		lastRunAt: timestamp("last_run_at", { withTimezone: true }),
		enabled: integer("enabled").notNull().default(1),
		config: jsonb("config").$type<z.input<typeof eventDataSchema>>(),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("schedule_workflow_idx").on(table.workflowId),
		index("schedule_next_run_idx").on(table.nextRunAt),
	],
);

export type Schedule = typeof schedule.$inferSelect;
export type NewSchedule = typeof schedule.$inferInsert;
