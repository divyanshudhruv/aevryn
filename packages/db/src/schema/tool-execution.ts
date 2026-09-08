import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import { TOOL_STATUSES } from "../domain";
import type { toolInputSchema, toolOutputSchema } from "../zod";
import { workflow } from "./workflow";
import { workflowExecution } from "./workflow-execution";
import { workflowStep } from "./workflow-step";

export const toolExecution = pgTable(
	"tool_execution",
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
		tool: text("tool").notNull(),
		provider: text("provider"),
		status: text("status", { enum: TOOL_STATUSES }).notNull(),
		input: jsonb("input").$type<z.input<typeof toolInputSchema>>().notNull(),
		output: jsonb("output").$type<z.input<typeof toolOutputSchema>>(),
		errorCode: text("error_code"),
		durationMs: integer("duration_ms"),
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
		index("tool_execution_workflow_created_idx").on(
			table.workflowId,
			table.createdAt,
		),
		index("tool_execution_tool_status_idx").on(table.tool, table.status),
		index("tool_execution_error_idx").on(table.errorCode),
	],
);

export type ToolExecution = typeof toolExecution.$inferSelect;
export type NewToolExecution = typeof toolExecution.$inferInsert;
