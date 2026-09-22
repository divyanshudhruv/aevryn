import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const rows =
	await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at asc`;
for (const r of rows)
	console.log(
		"row:",
		r.hash.slice(0, 16),
		new Date(Number(r.created_at)).toISOString(),
	);
const h0000 = createHash("sha256")
	.update(readFileSync("src/migrations/0000_gifted_proteus.sql", "utf8"))
	.digest("hex");
console.log(
	"sha256(0000) =",
	h0000.slice(0, 16),
	rows.some((r) => r.hash === h0000) ? "MATCHES stored row" : "NO match",
);
const h0014 = createHash("sha256")
	.update(readFileSync("src/migrations/0014_rls_with_check.sql", "utf8"))
	.digest("hex");
console.log("sha256(0014) =", h0014.slice(0, 16));
await sql.end();
