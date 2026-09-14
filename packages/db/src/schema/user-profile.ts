import { sql } from "drizzle-orm";
import {
  foreignKey,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { planLevelEnum } from "./enums";

const uuidText = sql`(concat('prf_', gen_random_uuid()::text))`;
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: text("id").primaryKey().default(uuidText),
    userId: uuid("user_id").notNull().unique(),
    name: text("name").notNull().default(""),
    email: text("email").notNull().default(""),
    avatarUrl: text("avatar_url").notNull().default(""),
    plan: planLevelEnum("plan").notNull().default("free"),
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
    pgPolicy("user_profiles_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("user_profiles_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("user_profiles_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("user_profiles_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
  ],
).enableRLS();

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
