import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
try {
	const r =
		await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 3`;
	console.log("last applied:", r.map((x) => x.hash).join(", "));
} catch (e) {
	console.log("journal read err:", e.message);
}
for (const s of [
	`ALTER POLICY "groups_update" ON "groups" WITH CHECK ("groups"."user_id" = auth.uid())`,
	`ALTER POLICY "threads_update" ON "threads" WITH CHECK ("threads"."user_id" = auth.uid())`,
]) {
	try {
		await sql.unsafe(s);
		console.log("OK:", s.slice(0, 50));
	} catch (e) {
		console.log("ERR:", e.message, "| code:", e.code);
	}
}
await sql.end();
