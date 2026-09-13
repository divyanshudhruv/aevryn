import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { threads } from "./thread";

const uuidText = sql`(concat('ts_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

export const threadSettings = pgTable(
	"thread_settings",
	{
		id: text("id").primaryKey().default(uuidText),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
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
		index("thread_settings_thread_idx").on(table.threadId),
		index("thread_settings_user_idx").on(table.userId),
		pgPolicy("thread_settings_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
		pgPolicy("thread_settings_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
		pgPolicy("thread_settings_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
		pgPolicy("thread_settings_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`exists (select 1 from "threads" t where t."id" = ${table.threadId} and t."user_id" = auth.uid())`,
		}),
	],
).enableRLS();

export type ThreadSettings = typeof threadSettings.$inferSelect;
export type NewThreadSettings = typeof threadSettings.$inferInsert;
