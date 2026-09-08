import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import type { agentStateSchema } from "../zod";
import { workflow } from "./workflow";

export const agentState = pgTable(
	"agent_state",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		/** Frequently queried snapshot columns extracted from the JSONB payload. */
		phase: text("phase"),
		status: text("status"),
		version: integer("version").notNull().default(1),
		data: jsonb("data").$type<z.input<typeof agentStateSchema>>().notNull(),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("agent_state_workflow_uidx").on(table.workflowId)],
);

export type AgentState = typeof agentState.$inferSelect;
export type NewAgentState = typeof agentState.$inferInsert;
