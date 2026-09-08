import dotenv from "dotenv";

dotenv.config({
	path: "../../apps/web/.env",
});

const { db } = await import("@aevryn/db");
import { sql } from "drizzle-orm";

const DOMAIN_TABLES = [
	"workflow",
	"workflow_execution",
	"workflow_step",
	"tool_execution",
	"agent_state",
	"event",
	"observation",
	"memory",
	"recovery_attempt",
	"schedule",
	"notification",
];

const dbClient = db as unknown as {
	execute: (query: ReturnType<typeof sql.raw>) => Promise<{
		rows: Array<Record<string, unknown>>;
	}>;
};

for (const table of DOMAIN_TABLES) {
	const rows = await dbClient.execute(sql.raw(`SELECT count(*) AS n FROM ${table}`));
	const first = rows.rows[0] as { n: string | number } | undefined;
	const count = first?.n ?? 0;
	console.log(`${table}: ${count} rows`);
}

await dbClient.execute(sql.raw(`TRUNCATE TABLE ${DOMAIN_TABLES.join(", ")} CASCADE`));
console.log("RESET: domain tables truncated");