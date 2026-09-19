import { db } from "../src/index.ts";
const r = await db.execute(`
  select tgname, pg_get_triggerdef(t.oid) def, prosrc src
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal and (prosrc ilike '%limit%' or tgname ilike '%limit%')
  order by 1`);
console.log(r.rows.map((r) => `${r.tgname}\n  ${r.def}\n  ${r.src.split("\n").filter(l => l.includes("RAISE") || l.includes("COUNT") || l.includes("SELECT")).join("\n  ")}`).join("\n\n"));
process.exit(0);
