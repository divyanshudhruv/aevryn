import { sql } from "drizzle-orm";
import { boolean, index, integer, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('wf_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { runStatusEnum } from "./enums";
import { workspaces } from "./workspace";

export const workflows = pgTable(
	"workflows",
	{
		id: text("id").primaryKey().default(uuidText),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		status: runStatusEnum("status").notNull().default("running"),
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