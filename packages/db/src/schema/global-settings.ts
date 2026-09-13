import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { workspaces } from "./workspace";

const uuidText = sql`(concat('gs_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

export const globalSettings = pgTable(
	"global_settings",
	{
		id: text("id").primaryKey().default(uuidText),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		/** JSON document. Always present so reads never branch on NULL vs missing. */
		settings: text("settings")
			.notNull()
			.default(`{}`)
			.$type<string>(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("global_settings_user_idx").on(table.userId),
		pgPolicy("global_settings_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("global_settings_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("global_settings_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("global_settings_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type GlobalSettings = typeof globalSettings.$inferSelect;
export type NewGlobalSettings = typeof globalSettings.$inferInsert;
