// One-time repair for the migration journal. This DB's schema was applied via
// `drizzle-kit push` (or out-of-band), so drizzle.__drizzle_migrations does
// not match the local migration files and `drizzle-kit migrate` replays
// 0000 from scratch, dying on "already exists". This script records every
// existing migration as applied (after verifying sentinel objects exist) so
// migrate becomes a no-op now and works for future migrations.
import "dotenv/config";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });

// ── 1. Verify the schema is actually complete before stamping ──
const sentinels = [
	["tool_call_logs", "table (0005)"],
	["callouts", "table (0011)"],
	["groups", "table (0000)"],
];
for (const [table, label] of sentinels) {
	const exists = await sql`
		select 1 from information_schema.tables
		where table_schema = 'public' and table_name = ${table} limit 1`;
	if (exists.length === 0) {
		console.error(
			`ABORT: sentinel table ${table} (${label}) missing — the schema is NOT fully applied; do not stamp.`,
		);
		process.exit(1);
	}
}
console.log("sentinels OK — schema appears fully applied");

// ── 2. Stamp every journal entry whose hash is not yet recorded ──
const journal = JSON.parse(
	readFileSync("src/migrations/meta/_journal.json", "utf8"),
);
let stamped = 0;
for (const entry of journal.entries) {
	const content = readFileSync(`src/migrations/${entry.tag}.sql`, "utf8");
	const hash = createHash("sha256").update(content).digest("hex");
	const known = await sql`
		select 1 from drizzle.__drizzle_migrations where hash = ${hash} limit 1`;
	if (known.length > 0) continue;
	await sql`
		insert into drizzle.__drizzle_migrations (hash, created_at)
		values (${hash}, ${entry.when})`;
	stamped += 1;
	console.log(`stamped ${entry.tag}`);
}
console.log(`done — ${stamped} entries stamped`);
await sql.end();
