import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import { APPROVAL_STATUSES } from "../domain";
import type { eventDataSchema } from "../zod";
import { user } from "./auth";
import { workflow } from "./workflow";
import { workflowExecution } from "./workflow-execution";

export const approval = pgTable(
	"approval",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		executionId: text("execution_id").references(() => workflowExecution.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		toolName: text("tool_name").notNull(),
		input: jsonb("input").$type<z.input<typeof eventDataSchema>>().notNull(),
		status: text("status", { enum: APPROVAL_STATUSES })
			.notNull()
			.default("pending"),
		reason: text("reason"),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		decidedAt: timestamp("decided_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("approval_workflow_status_idx").on(table.workflowId, table.status),
		index("approval_execution_created_idx").on(
			table.executionId,
			table.createdAt,
		),
		index("approval_user_status_idx").on(table.userId, table.status),
	],
);

export type Approval = typeof approval.$inferSelect;
export type NewApproval = typeof approval.$inferInsert;
