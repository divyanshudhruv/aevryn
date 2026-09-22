import dotenv from "dotenv";

dotenv.config({
	path: "../../apps/web/.env",
});

if (process.env.CI || process.env.VERCEL) {
	console.error(
		"RESET: refusing to truncate tables in CI/Vercel (destructive op).",
	);
	process.exit(1);
}

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
	"recovery_attempt",
	"schedule",
	"notification",
	"approval",
];

const dbClient = db as unknown as {
	execute: (query: ReturnType<typeof sql.raw>) => Promise<{
		rows: Array<Record<string, unknown>>;
	}>;
};

for (const table of DOMAIN_TABLES) {
	try {
		const rows = await dbClient.execute(
			sql.raw(`SELECT count(*) AS n FROM ${table}`),
		);
		const first = rows.rows[0] as { n: string | number } | undefined;
		const count = first?.n ?? 0;
		console.log(`${table}: ${count} rows`);
	} catch {
		console.log(`${table}: (not present)`);
	}
}

let truncated = 0;
for (const table of DOMAIN_TABLES) {
	try {
		await dbClient.execute(sql.raw(`TRUNCATE TABLE ${table} CASCADE`));
		truncated += 1;
	} catch {}
}
console.log(
	`RESET: ${truncated}/${DOMAIN_TABLES.length} domain tables truncated`,
);
