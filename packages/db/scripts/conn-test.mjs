import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "";
console.log("port:", url.match(/:(\d+)\//)?.[1] ?? "?");
const sql = postgres(url, { max: 1, connect_timeout: 15 });
try {
	const r =
		await sql`select current_user, version() like '%Supabase%' as is_supa`;
	console.log("connected:", r[0]);
} catch (e) {
	console.log("CONN ERR:", e.message, e.code);
}
try {
	const r =
		await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
	console.log("journal rows:", r[0].n);
} catch (e) {
	console.log("JOURNAL ERR:", e.message);
}
await sql.end();
