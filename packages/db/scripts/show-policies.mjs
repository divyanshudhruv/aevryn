import "dotenv/config";
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const r = await sql`
  select tablename,
    count(*) filter (where cmd='SELECT' and qual is not null) as sel_scoped,
    count(*) filter (where cmd='INSERT' and with_check is not null) as ins_scoped,
    count(*) filter (where cmd='UPDATE' and qual is not null and with_check is not null) as upd_scoped,
    count(*) filter (where cmd='DELETE' and qual is not null) as del_scoped
  from pg_policies where schemaname='public' and roles @> '{authenticated}'
  group by tablename order by tablename`;
let bad = 0;
for (const p of r) {
  const ok = p.sel_scoped > 0 && p.ins_scoped > 0 && p.upd_scoped > 0 && p.del_scoped > 0;
  if (!ok) bad++;
  console.log(`${ok ? "OK " : "!! "}${p.tablename}  sel=${p.sel_scoped} ins=${p.ins_scoped} upd=${p.upd_scoped} del=${p.del_scoped}`);
}
console.log(bad === 0 ? "\nALL TABLES FULLY SCOPED ✅" : `\n${bad} table(s) still unscoped`);
await sql.end();
