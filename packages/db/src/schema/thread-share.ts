import { sql } from "drizzle-orm";
import { pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { threadRoleEnum } from "./enums";
import { invites } from "./invite";
import { threads } from "./thread";

const ownedThread = (threadId: unknown) =>
	sql`exists (select 1 from "threads" t where t."id" = ${threadId} and t."user_id" = auth.uid())`;

export const threadShares = pgTable(
	"thread_shares",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		role: threadRoleEnum("role").notNull().default("editor"),
		invitedBy: uuid("invited_by").notNull(),
		inviteId: text("invite_id").references(() => invites.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("thread_shares_thread_user_idx").on(table.threadId, table.userId),
		pgPolicy("thread_shares_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${ownedThread(table.threadId)} or ${table.userId} = auth.uid()`,
		}),
		pgPolicy("thread_shares_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: ownedThread(table.threadId),
		}),
		pgPolicy("thread_shares_delete", {
			for: "delete",
			to: authenticatedRole,
			using: ownedThread(table.threadId),
		}),
	],
).enableRLS();

export type ThreadShare = typeof threadShares.$inferSelect;
export type NewThreadShare = typeof threadShares.$inferInsert;