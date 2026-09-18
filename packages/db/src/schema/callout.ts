import { sql } from "drizzle-orm";
import {
	boolean,
	integer,
	pgPolicy,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole } from "drizzle-orm/supabase";

const uuidText = sql`(concat('cal_', gen_random_uuid()::text))`;

export const callouts = pgTable(
	"callouts",
	{
		id: text("id").primaryKey().default(uuidText),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		imageUrl: text("image_url"),
		/** Lower = renders first in the stacked callout area. */
		order: integer("sort_order").notNull().default(0),
		visible: boolean("visible").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	() => [
		// Global promo content — public to read, administered out-of-band
		// (seed/service-role writers bypass RLS).
		pgPolicy("callouts_select_anon", {
			for: "select",
			to: anonRole,
			using: sql`true`,
		}),
		pgPolicy("callouts_select_auth", {
			for: "select",
			to: authenticatedRole,
			using: sql`true`,
		}),
	],
).enableRLS();

export type Callout = typeof callouts.$inferSelect;
export type NewCallout = typeof callouts.$inferInsert;
