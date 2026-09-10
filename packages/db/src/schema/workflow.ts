import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { WORKFLOW_STATUSES } from "../domain";
import { user } from "./auth";

export const workflow = pgTable(
	"workflow",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		objective: text("objective").notNull(),
		customPrompt: text("custom_prompt"),
		status: text("status", { enum: WORKFLOW_STATUSES })
			.notNull()
			.default("draft"),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(table) => [
		index("workflow_user_status_idx").on(table.userId, table.status),
		index("workflow_user_created_idx").on(table.userId, table.createdAt),
	],
);

export type Workflow = typeof workflow.$inferSelect;
export type NewWorkflow = typeof workflow.$inferInsert;
