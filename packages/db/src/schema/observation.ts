import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import type { observationContentSchema } from "../zod";
import { workflow } from "./workflow";

export const observation = pgTable(
	"observation",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		content: jsonb("content")
			.$type<z.input<typeof observationContentSchema>>()
			.notNull(),
		schemaVersion: integer("schema_version").notNull().default(1),
		observedAt: timestamp("observed_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("observation_workflow_observed_idx").on(
			table.workflowId,
			table.observedAt,
		),
		index("observation_workflow_type_idx").on(table.workflowId, table.type),
	],
);

export type Observation = typeof observation.$inferSelect;
export type NewObservation = typeof observation.$inferInsert;
