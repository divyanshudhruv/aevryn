import { sql } from "drizzle-orm";
import { bigint, boolean, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { isMemberOf } from "./policies";
import { threads } from "./thread";
import { workspaces } from "./workspace";

export const files = pgTable(
	"files",
	{
		id: text("id").primaryKey(),
		userId: uuid("user_id").notNull(),
		threadId: text("thread_id").references(() => threads.id, {
			onDelete: "set null",
		}),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		bucket: text("bucket").notNull().default("chat-attachments"),
		path: text("path").notNull(),
		mimeType: text("mime_type"),
		sizeBytes: bigint("size_bytes", { mode: "number" }),
		compressed: boolean("compressed").notNull().default(false),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		pgPolicy("files_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid() or ${isMemberOf(table.workspaceId)}`,
		}),
		pgPolicy("files_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("files_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("files_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;