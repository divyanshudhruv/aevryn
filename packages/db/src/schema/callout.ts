import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, boolean, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('cal_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { workspaces } from "./workspace";
import { userProfiles } from "./user-profile";

export const callouts = pgTable(
	"callouts",
	{
		id: text("id").primaryKey().default(uuidText),
		/** When set, the callout is workspace-scoped. Otherwise it is user-scoped. */
		workspaceId: text("workspace_id").references(() => workspaces.id, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id").references(() => userProfiles.userId, {
			onDelete: "cascade",
		}),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		imageUrl: text("image_url"),
		/** Lower = renders first in the stacked callout area. */
		order: integer("sort_order").notNull().default(0),
		visible: boolean("visible").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("callouts_workspace_idx").on(table.workspaceId),
		index("callouts_user_idx").on(table.userId),
		pgPolicy("callouts_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`
				${table.userId} = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = ${table.workspaceId}
					  and w."created_by" = auth.uid()
				)
			`,
		}),
		pgPolicy("callouts_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`
				${table.userId} = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = ${table.workspaceId}
					  and w."created_by" = auth.uid()
				)
			`,
		}),
		pgPolicy("callouts_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`
				${table.userId} = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = ${table.workspaceId}
					  and w."created_by" = auth.uid()
				)
			`,
		}),
		pgPolicy("callouts_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`
				${table.userId} = auth.uid()
				or exists (
					select 1 from "workspaces" w
					where w."id" = ${table.workspaceId}
					  and w."created_by" = auth.uid()
				)
			`,
		}),
	],
).enableRLS();

export type Callout = typeof callouts.$inferSelect;
export type NewCallout = typeof callouts.$inferInsert;
