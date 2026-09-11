import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { roleEnum } from "./enums";
import { isEditorOf, isMemberOf } from "./policies";
import { workspaces } from "./workspace";

export const workspaceMembers = pgTable(
	"workspace_members",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		role: roleEnum("role").notNull().default("viewer"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("workspace_members_workspace_user_idx").on(
			table.workspaceId,
			table.userId,
		),
		pgPolicy("workspace_members_select", {
			for: "select",
			to: authenticatedRole,
			using: isMemberOf(table.workspaceId),
		}),
		pgPolicy("workspace_members_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: isEditorOf(table.workspaceId),
		}),
		pgPolicy("workspace_members_update", {
			for: "update",
			to: authenticatedRole,
			using: isEditorOf(table.workspaceId),
		}),
		pgPolicy("workspace_members_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${isEditorOf(table.workspaceId)} and ${table.role} != 'owner'`,
		}),
	],
).enableRLS();

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;