import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { runStatusEnum } from "./enums";
import { threads } from "./thread";

const wfText = sql`(concat('wf_', gen_random_uuid()::text))`;
const plsText = sql`(concat('pls_', gen_random_uuid()::text))`;

export const workflows = pgTable(
	"workflows",
	{
		id: text("id").primaryKey().default(wfText),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		workspaceId: text("workspace_id").notNull(),
		title: text("title").notNull(),
		objective: text("objective").notNull().default(""),
		status: runStatusEnum("status").notNull().default("idle"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [authUsers.id],
		}).onDelete("cascade"),
		index("workflows_thread_idx").on(table.threadId),
		pgPolicy("workflows_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("workflows_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("workflows_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("workflows_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export const planSteps = pgTable(
	"plan_steps",
	{
		id: text("id").primaryKey().default(plsText),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflows.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		position: integer("position").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		status: runStatusEnum("status").notNull().default("idle"),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [authUsers.id],
		}).onDelete("cascade"),
		index("plan_steps_workflow_position_idx").on(table.workflowId, table.position),
		pgPolicy("plan_steps_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("plan_steps_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("plan_steps_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("plan_steps_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type PlanStep = typeof planSteps.$inferSelect;
export type NewPlanStep = typeof planSteps.$inferInsert;
