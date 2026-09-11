import { sql } from "drizzle-orm";
import { index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { hookStatusEnum } from "./enums";
import { runs } from "./run";
import { threads } from "./thread";
import { workspaces } from "./workspace";

export const webhookHooks = pgTable(
	"webhook_hooks",
	{
		id: text("id").primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => runs.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		threadId: text("thread_id")
			.notNull()
			.references(() => threads.id, { onDelete: "cascade" }),
		userId: uuid("user_id").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		status: hookStatusEnum("status").notNull().default("active"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		firedAt: timestamp("fired_at", { withTimezone: true }),
		consumePayload: jsonb("consume_payload"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("webhook_hooks_run_idx").on(table.runId),
		index("webhook_hooks_status_expiry_idx").on(table.status, table.expiresAt),
		pgPolicy("webhook_hooks_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("webhook_hooks_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("webhook_hooks_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("webhook_hooks_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type WebhookHook = typeof webhookHooks.$inferSelect;
export type NewWebhookHook = typeof webhookHooks.$inferInsert;