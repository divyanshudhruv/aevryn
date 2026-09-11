import { pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { planStatusEnum } from "./enums";
import { planViaEditableWorkflow, planViaOwnedWorkflow, planViaVisibleWorkflow } from "./policies";
import { workflows } from "./workflow";

export const plans = pgTable(
	"plans",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.unique()
			.references(() => workflows.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		objective: text("objective"),
		summary: text("summary"),
		status: planStatusEnum("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		pgPolicy("plans_select", {
			for: "select",
			to: authenticatedRole,
			using: planViaVisibleWorkflow(table.workflowId),
		}),
		pgPolicy("plans_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: planViaEditableWorkflow(table.workflowId),
		}),
		pgPolicy("plans_update", {
			for: "update",
			to: authenticatedRole,
			using: planViaEditableWorkflow(table.workflowId),
		}),
		pgPolicy("plans_delete", {
			for: "delete",
			to: authenticatedRole,
			using: planViaOwnedWorkflow(table.workflowId),
		}),
	],
).enableRLS();

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;