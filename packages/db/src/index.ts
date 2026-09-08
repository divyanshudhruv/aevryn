import { env } from "@aevryn/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export * from "./domain";
export * from "./ids";
export * from "./zod";

export function createDb() {
	return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
