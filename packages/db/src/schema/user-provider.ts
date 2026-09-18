import { sql } from "drizzle-orm";
import {
	foreignKey,
	jsonb,
	pgPolicy,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

const uuidText = sql`(concat('prv_', gen_random_uuid()::text))`;

export interface ProviderModel {
	id: string;
	displayName?: string;
}

export const userProviders = pgTable(
	"user_providers",
	{
		id: text("id").primaryKey().default(uuidText),
		userId: uuid("user_id").notNull(),
		slug: text("slug").notNull(),
		displayName: text("display_name").notNull(),
		baseUrl: text("base_url").notNull(),
		apiKeyEncrypted: text("api_key_encrypted").notNull(),
		models: jsonb("models").$type<ProviderModel[]>().notNull().default([]),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [authUsers.id],
		}).onDelete("cascade"),
		uniqueIndex("user_providers_user_slug_idx").on(table.userId, table.slug),
		pgPolicy("user_providers_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("user_providers_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("user_providers_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("user_providers_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type UserProvider = typeof userProviders.$inferSelect;
export type NewUserProvider = typeof userProviders.$inferInsert;
