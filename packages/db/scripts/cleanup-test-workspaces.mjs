// One-time remediation: purge workspace fixture pollution left by the old
// per-run random-id test seeding (the DB trigger caps workspaces/user at 3,
// so the workflow suite self-destructed after a few runs). Test users are
// reserved UUIDs that exist only for tests; deleting their workspaces
// cascades their threads/messages/workflows. Safe to re-run.
import "dotenv/config";
import postgres from "postgres";

const TEST_USERS = [
	"00000000-0000-0000-0000-000000000001",
	"00000000-0000-0000-0000-000000000002",
	"00000000-0000-0000-0000-000000000003",
	"00000000-0000-0000-0000-000000000004",
];

const sql = postgres(process.env.DATABASE_URL ?? "");
const deleted = await sql`
	delete from workspaces
	where created_by in ${sql(TEST_USERS)}
	returning id`;
console.log(`deleted ${deleted.count} test workspaces`);
const counts = await sql`
	select created_by, count(*)::int as n from workspaces group by created_by order by n desc limit 8`;
for (const c of counts) console.log(c.created_by, c.n);
await sql.end();
