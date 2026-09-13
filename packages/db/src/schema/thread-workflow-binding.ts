import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('bnd_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { threads } from "./thread";
import { workflows } from "./workflow";
import { workspaces } from "./workspace";

export const threadWorkflowBindings = pgTable(
	"thread_workflow_bindings",
	{
		id: text("id").primaryKey().default(uuidText),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflows.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		boundAt: timestamp("bound_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("thread_workflow_bindings_thread_uq").on(table.threadId),
		index("thread_workflow_bindings_workflow_idx").on(table.workflowId),
		index("thread_workflow_bindings_user_idx").on(table.userId),
		pgPolicy("thread_workflow_bindings_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
		pgPolicy("thread_workflow_bindings_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
		pgPolicy("thread_workflow_bindings_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
		pgPolicy("thread_workflow_bindings_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
	],
).enableRLS();

export type ThreadWorkflowBinding = typeof threadWorkflowBindings.$inferSelect;
export type NewThreadWorkflowBinding = typeof threadWorkflowBindings.$inferInsert;
