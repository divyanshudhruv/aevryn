import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import { FAILURE_CLASSES, RECOVERY_STATUSES } from "../domain";
import type { eventDataSchema } from "../zod";
import { workflow } from "./workflow";
import { workflowExecution } from "./workflow-execution";
import { workflowStep } from "./workflow-step";

export const recoveryAttempt = pgTable(
	"recovery_attempt",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		executionId: text("execution_id").references(() => workflowExecution.id, {
			onDelete: "set null",
		}),
		stepId: text("step_id").references(() => workflowStep.id, {
			onDelete: "set null",
		}),
		failureClass: text("failure_class", { enum: FAILURE_CLASSES }).notNull(),
		failureCode: text("failure_code"),
		attempt: integer("attempt").notNull().default(1),
		strategy: text("strategy"),
		result: text("result", { enum: RECOVERY_STATUSES }).notNull(),
		detail: jsonb("detail").$type<z.input<typeof eventDataSchema>>(),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		index("recovery_execution_created_idx").on(
			table.executionId,
			table.createdAt,
		),
		index("recovery_workflow_class_idx").on(
			table.workflowId,
			table.failureClass,
		),
	],
);

export type RecoveryAttempt = typeof recoveryAttempt.$inferSelect;
export type NewRecoveryAttempt = typeof recoveryAttempt.$inferInsert;
