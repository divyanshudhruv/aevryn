import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
);

export type Callout = typeof callouts.$inferSelect;
export type NewCallout = typeof callouts.$inferInsert;