import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const uuidText = sql`(concat('thd_', gen_random_uuid()::text))`;
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";

import { groups } from "./group";
import { workspaces } from "./workspace";
import { runStatusEnum } from "./enums";

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey().default(uuidText),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").notNull(),
    title: text("title").notNull().default("New thread"),
    boundWorkflowId: text("bound_workflow_id"),
    status: runStatusEnum("status").notNull().default("idle"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    index("threads_user_workspace_last_msg_idx").on(
      table.userId,
      table.workspaceId,
      table.lastMessageAt,
    ),
    index("threads_group_idx").on(table.groupId),
    pgPolicy("threads_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("threads_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("threads_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy("threads_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${table.userId} = auth.uid()`,
    }),
  ],
).enableRLS();

export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
