import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	vector,
} from "drizzle-orm/pg-core";

import type { z } from "zod";

import { MEMORY_CATEGORIES } from "../domain";
import type { memoryContentSchema } from "../zod";
import { user } from "./auth";
import { workflow } from "./workflow";

export const memory = pgTable(
	"memory",
	{
		id: text("id").primaryKey(),
		workflowId: text("workflow_id").references(() => workflow.id, {
			onDelete: "set null",
		}),
		/** Owning user; required for cross-user isolation. */
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		category: text("category", { enum: MEMORY_CATEGORIES }).notNull(),
		content: jsonb("content")
			.$type<z.input<typeof memoryContentSchema>>()
			.notNull(),
		/** Semantic embedding (must match configured embedder dimension). */
		embedding: vector("embedding", { dimensions: 1536 }),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		schemaVersion: integer("schema_version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("memory_user_category_idx").on(table.userId, table.category),
		index("memory_workflow_idx").on(table.workflowId),
		index("memory_embedding_hnsw_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops"),
		),
	],
);

export type Memory = typeof memory.$inferSelect;
export type NewMemory = typeof memory.$inferInsert;
