import { sql } from "drizzle-orm";
import { boolean, index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { groups } from "./group";
import { isEditorOf, isMemberOf } from "./policies";
import { workspaces } from "./workspace";

export const threads = pgTable(
	"threads",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		groupId: text("group_id").references(() => groups.id, {
			onDelete: "set null",
		}),
		userId: uuid("user_id").notNull(),
		title: text("title").notNull().default(""),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		shareEnabled: boolean("share_enabled").notNull().default(false),
		boundWorkflowId: text("bound_workflow_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
	},
	(table) => [
		index("threads_user_workspace_last_msg_idx").on(
			table.userId,
			table.workspaceId,
			table.lastMessageAt,
		),
		index("threads_group_idx").on(table.groupId),
		pgPolicy("threads_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${isMemberOf(table.workspaceId)} or exists (select 1 from "thread_shares" ts where ts."thread_id" = ${table.id} and ts."user_id" = auth.uid())`,
		}),
		pgPolicy("threads_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid() and ${isEditorOf(table.workspaceId)}`,
		}),
		pgPolicy("threads_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${isEditorOf(table.workspaceId)}`,
		}),
		pgPolicy("threads_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;