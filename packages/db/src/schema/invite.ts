import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { inviteKindEnum, inviteStatusEnum, threadRoleEnum } from "./enums";
import { isEditorOf } from "./policies";
import { threads } from "./thread";
import { workspaces } from "./workspace";

export const invites = pgTable(
	"invites",
	{
		id: text("id").primaryKey(),
		kind: inviteKindEnum("kind").notNull(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		invitedBy: uuid("invited_by").notNull(),
		inviteeEmail: text("invitee_email").notNull(),
		invitedUserId: uuid("invited_user_id"),
		tokenHash: text("token_hash").notNull().unique(),
		role: threadRoleEnum("role").notNull().default("editor"),
		status: inviteStatusEnum("status").notNull().default("pending"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		acceptedAt: timestamp("accepted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("invites_thread_idx").on(table.threadId),
		index("invites_token_hash_idx").on(table.tokenHash),
		pgPolicy("invites_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.invitedBy} = auth.uid() or ${table.invitedUserId} = auth.uid() or ${isEditorOf(table.workspaceId)}`,
		}),
		pgPolicy("invites_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.invitedBy} = auth.uid()`,
		}),
		pgPolicy("invites_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.invitedBy} = auth.uid() or ${isEditorOf(table.workspaceId)}`,
		}),
		pgPolicy("invites_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.invitedBy} = auth.uid()`,
		}),
	],
).enableRLS();

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;