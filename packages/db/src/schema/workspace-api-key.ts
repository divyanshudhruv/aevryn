import { sql } from "drizzle-orm";
import { customType, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const uuidText = sql`(concat('key_', gen_random_uuid()::text))`;
import { authenticatedRole } from "drizzle-orm/supabase";

import { apiProviderEnum } from "./enums";
import { ownsWorkspace } from "./policies";
import { workspaces } from "./workspace";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
	dataType() {
		return "bytea";
	},
});

export const workspaceApiKeys = pgTable(
	"workspace_api_keys",
	{
		id: text("id").primaryKey().default(uuidText),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by").notNull(),
		provider: apiProviderEnum("provider").notNull(),
		keyEncrypted: bytea("key_encrypted").notNull(),
		modelName: text("model_name"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("workspace_api_keys_workspace_provider_idx").on(
			table.workspaceId,
			table.provider,
		),
		pgPolicy("workspace_api_keys_select", {
			for: "select",
			to: authenticatedRole,
			using: ownsWorkspace(table.workspaceId),
		}),
		pgPolicy("workspace_api_keys_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${ownsWorkspace(table.workspaceId)} and ${table.createdBy} = auth.uid()`,
		}),
		pgPolicy("workspace_api_keys_update", {
			for: "update",
			to: authenticatedRole,
			using: ownsWorkspace(table.workspaceId),
		}),
		pgPolicy("workspace_api_keys_delete", {
			for: "delete",
			to: authenticatedRole,
			using: ownsWorkspace(table.workspaceId),
		}),
	],
).enableRLS();

export type WorkspaceApiKey = typeof workspaceApiKeys.$inferSelect;
export type NewWorkspaceApiKey = typeof workspaceApiKeys.$inferInsert;