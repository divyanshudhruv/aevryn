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

const uuidText = sql`(concat('us_', gen_random_uuid()::text))`;

export interface UserSettingsData {
	notifications: {
		runFailed: boolean;
		runCompleted: boolean;
		runApproval: boolean;
	};
	defaultModel: { providerSlug: string; modelId: string } | null;
	/** Master switch for Mem0 recall/store. Null = default on when a key exists. */
	memoryEnabled: boolean | null;
}

export const DEFAULT_USER_SETTINGS: UserSettingsData = {
	notifications: { runFailed: true, runCompleted: true, runApproval: true },
	defaultModel: null,
	memoryEnabled: null,
};

export const userSettings = pgTable(
	"user_settings",
	{
		id: text("id").primaryKey().default(uuidText),
		userId: uuid("user_id").notNull(),
		settings: jsonb("settings").$type<UserSettingsData>().notNull(),
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
		uniqueIndex("user_settings_user_id_idx").on(table.userId),
		pgPolicy("user_settings_select", {
			for: "select",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("user_settings_insert", {
			for: "insert",
			to: authenticatedRole,
			withCheck: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("user_settings_update", {
			for: "update",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
		pgPolicy("user_settings_delete", {
			for: "delete",
			to: authenticatedRole,
			using: sql`${table.userId} = auth.uid()`,
		}),
	],
).enableRLS();

export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
