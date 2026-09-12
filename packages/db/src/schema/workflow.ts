import { sql } from "drizzle-orm";
import { boolean, index, integer, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { workflowStatusEnum } from "./enums";
import { threads } from "./thread";
import { workspaces } from "./workspace";

export const workflows = pgTable(
	"workflows",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		status: workflowStatusEnum("status").notNull().default("waiting"),
		autoApprove: boolean("auto_approve").notNull().default(false),
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
		index("workflows_user_status_idx").on(table.userId, table.status),
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

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;