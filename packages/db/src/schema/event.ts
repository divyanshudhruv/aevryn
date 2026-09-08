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
import { workflowExecution } from "./workflow-execution";

export const event = pgTable(
	"event",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id").references(() => workflow.id, {
			onDelete: "cascade",
		}),
		executionId: text("execution_id").references(() => workflowExecution.id, {
			onDelete: "set null",
		}),
		type: text("type").notNull(),
		data: jsonb("data").$type<z.input<typeof eventDataSchema>>().notNull(),
		schemaVersion: integer("schema_version").notNull().default(1),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("event_workflow_occurred_idx").on(table.workflowId, table.occurredAt),
		index("event_type_idx").on(table.type),
	],
);

export type Event = typeof event.$inferSelect;
export type NewEvent = typeof event.$inferInsert;
