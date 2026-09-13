import { sql } from "drizzle-orm";
import { integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('pls_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { planStepStatusEnum } from "./enums";
import { workflowEditable, workflowOwned, workflowVisible } from "./policies";
import { workflows } from "./workflow";

export const planSteps = pgTable(
	"plan_steps",
	{
		id: text("id").primaryKey().default(uuidText),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflows.id, { onDelete: "cascade" }),
		objective: text("objective"),
		position: integer("position").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		status: planStepStatusEnum("status").notNull().default("pending"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plan_steps_workflow_position_idx").on(table.workflowId, table.position),
		pgPolicy("plan_steps_select", {
			for: "select",
			to: authenticatedRole,
			using: workflowVisible(table.workflowId),
		}),
		pgPolicy("plan_steps_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: workflowEditable(table.workflowId),
		}),
		pgPolicy("plan_steps_update", {
			for: "update",
			to: authenticatedRole,
			using: workflowEditable(table.workflowId),
		}),
		pgPolicy("plan_steps_delete", {
			for: "delete",
			to: authenticatedRole,
			using: workflowOwned(table.workflowId),
		}),
	],
).enableRLS();

export type PlanStep = typeof planSteps.$inferSelect;
export type NewPlanStep = typeof planSteps.$inferInsert;