import { integer, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { planStepStatusEnum } from "./enums";
import { stepViaEditableWorkflow, stepViaOwnedWorkflow, stepViaVisibleWorkflow } from "./policies";
import { plans } from "./plan";

export const planSteps = pgTable(
	"plan_steps",
	{
		id: text("id").primaryKey(),
		planId: text("plan_id")
			.notNull()
			.references(() => plans.id, { onDelete: "cascade" }),
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
		uniqueIndex("plan_steps_plan_position_idx").on(table.planId, table.position),
		pgPolicy("plan_steps_select", {
			for: "select",
			to: authenticatedRole,
			using: stepViaVisibleWorkflow(table.planId),
		}),
		pgPolicy("plan_steps_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: stepViaEditableWorkflow(table.planId),
		}),
		pgPolicy("plan_steps_update", {
			for: "update",
			to: authenticatedRole,
			using: stepViaEditableWorkflow(table.planId),
		}),
		pgPolicy("plan_steps_delete", {
			for: "delete",
			to: authenticatedRole,
			using: stepViaOwnedWorkflow(table.planId),
		}),
	],
).enableRLS();

export type PlanStep = typeof planSteps.$inferSelect;
export type NewPlanStep = typeof planSteps.$inferInsert;