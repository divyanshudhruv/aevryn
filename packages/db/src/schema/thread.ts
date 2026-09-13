import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('thd_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { groups } from "./group";
import { workspaces } from "./workspace";
import { type WorkflowStatus, threadStatus } from "../domain";

export const threads = pgTable(
	"threads",
	{
		id: text("id").primaryKey().default(uuidText),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		groupId: text("group_id").references(() => groups.id, {
			onDelete: "set null",
		}),
		userId: uuid("user_id").notNull(),
		title: text("title").notNull().default(""),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("threads_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("threads_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
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
export function threadWorkflowStatus(thread: Pick<Thread, "boundWorkflowId">, workflowStatus: WorkflowStatus | null): WorkflowStatus | null {
	if (!thread.boundWorkflowId) {
		return null;
	}
	return workflowStatus;
}
export function threadStatusFromWorkflow(thread: Pick<Thread, "boundWorkflowId">, workflowStatus: WorkflowStatus | null): ReturnType<typeof threadStatus> {
	return threadStatus(workflowStatus);
}