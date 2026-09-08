import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { STEP_STATUSES } from "../domain";
import { workflowExecution } from "./workflow-execution";

export const workflowStep = pgTable(
	"workflow_step",
	{
		id: text("id").primaryKey(),
		executionId: text("execution_id")
			.notNull()
			.references(() => workflowExecution.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		status: text("status", { enum: STEP_STATUSES })
			.notNull()
			.default("pending"),
		order: integer("order").notNull().default(0),
		idempotencyKey: text("idempotency_key"),
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
		index("step_execution_created_idx").on(table.executionId, table.createdAt),
		index("step_execution_status_idx").on(table.executionId, table.status),
		uniqueIndex("step_execution_idempotency_uidx").on(
			table.executionId,
			table.idempotencyKey,
		),
	],
);

export type WorkflowStep = typeof workflowStep.$inferSelect;
export type NewWorkflowStep = typeof workflowStep.$inferInsert;
