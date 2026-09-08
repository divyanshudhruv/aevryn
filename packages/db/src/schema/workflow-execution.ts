import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { EXECUTION_STATUSES } from "../domain";
import { workflow } from "./workflow";

export const workflowExecution = pgTable(
	"workflow_execution",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		status: text("status", { enum: EXECUTION_STATUSES })
			.notNull()
			.default("pending"),
		reason: text("reason"),
		schemaVersion: integer("schema_version").notNull().default(1),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("execution_workflow_created_idx").on(
			table.workflowId,
			table.createdAt,
		),
		index("execution_workflow_status_idx").on(table.workflowId, table.status),
	],
);

export type WorkflowExecution = typeof workflowExecution.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecution.$inferInsert;
