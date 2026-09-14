import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const uuidText = sql`(concat('wp_', gen_random_uuid()::text))`;
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey().default(uuidText),
    name: text("name").notNull(),
    createdBy: uuid("created_by").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
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
      columns: [table.createdBy],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    uniqueIndex("workspaces_created_by_name_idx").on(
      table.createdBy,
      table.name,
    ),
    pgPolicy("workspaces_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.createdBy} = auth.uid()`,
    }),
    pgPolicy("workspaces_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.createdBy} = auth.uid()`,
    }),
    pgPolicy("workspaces_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.createdBy} = auth.uid()`,
    }),
    pgPolicy("workspaces_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.createdBy} = auth.uid()`,
    }),
  ],
).enableRLS();

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
