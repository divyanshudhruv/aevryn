import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { workflow } from "./workflow";
import { workflowExecution } from "./workflow-execution";

export const WEBHOOK_STATUSES = ["active", "used", "expired"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export const webhookBoard = pgTable(
	"webhook_board",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		executionId: text("execution_id").references(() => workflowExecution.id, {
			onDelete: "set null",
		}),
		tokenHash: text("token_hash").notNull(),
		instruction: text("instruction").notNull(),
		status: text("status", { enum: WEBHOOK_STATUSES })
			.notNull()
			.default("active"),
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		usedAt: timestamp("used_at", { withTimezone: true }),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("webhook_token_hash_uidx").on(table.tokenHash),
		index("webhook_workflow_created_idx").on(table.workflowId, table.createdAt),
	],
);

export type WebhookBoard = typeof webhookBoard.$inferSelect;
export type NewWebhookBoard = typeof webhookBoard.$inferInsert;
