import { sql } from "drizzle-orm";
import { index, integer, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { groupKindEnum } from "./enums";
import { isEditorOf, isMemberOf } from "./policies";
import { workspaces } from "./workspace";

export const groups = pgTable(
	"groups",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		name: text("name").notNull(),
		kind: groupKindEnum("kind").notNull().default("custom"),
		position: integer("position").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("groups_workspace_name_idx").on(table.workspaceId, table.name),
		index("groups_workspace_position_idx").on(table.workspaceId, table.position),
		pgPolicy("groups_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${isMemberOf(table.workspaceId)}`,
		}),
		pgPolicy("groups_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid() and ${isEditorOf(table.workspaceId)}`,
		}),
		pgPolicy("groups_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${isEditorOf(table.workspaceId)}`,
		}),
		pgPolicy("groups_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.kind} = 'custom' and (${table.userId} = auth.uid() or ${isEditorOf(table.workspaceId)})`,
		}),
	],
).enableRLS();

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;