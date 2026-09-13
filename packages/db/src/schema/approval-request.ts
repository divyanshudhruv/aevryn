import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('apv_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { approvalStatusEnum } from "./enums";
import { canReadThread } from "./policies";
import { runs } from "./run";
import { threads } from "./thread";
import { workflows } from "./workflow";

export const approvalRequests = pgTable(
	"approval_requests",
	{
		id: text("id").primaryKey().default(uuidText),
		runId: text("run_id")
			.notNull()
			.references(() => runs.id, { onDelete: "cascade" }),
		workflowId: text("workflow_id").references(() => workflows.id, {
			onDelete: "set null",
		}),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		userId: uuid("user_id").notNull(),
		toolName: text("tool_name").notNull(),
		input: jsonb("input"),
		schema: jsonb("schema"),
		status: approvalStatusEnum("status").notNull().default("pending"),
		autoApproved: boolean("auto_approved").notNull().default(false),
		resolvedAt: timestamp("resolved_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("approval_requests_status_created_idx").on(table.status, table.createdAt),
		index("approval_requests_thread_idx").on(table.threadId),
		pgPolicy("approval_requests_select", {
			for: "select",
			to: authenticatedRole,
			using: canReadThread(table.threadId),
		}),
		pgPolicy("approval_requests_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: canReadThread(table.threadId),
		}),
		pgPolicy("approval_requests_update", {
			for: "update",
			to: authenticatedRole,
			using: canReadThread(table.threadId),
		}),
	],
).enableRLS();

export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;