// Confere o supabase/162_pe_fraco.sql num Postgres em memória (PGlite): os jogadores de hoje ganham a nota (ambidestro de 13 a 20, os outros
// de 1 a 12), a nota não muda ao rodar de novo, e o jogador novo nasce com ela pelo gatilho do pé.
// Uso: node ferramentas/teste_pe_fraco_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const ler = f => fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create table jogadores (id bigserial primary key, pos text, pe text);
create function sortear_pe(p_pos text) returns text language sql as $$ select 'D' $$;
insert into jogadores (pos, pe) select 'MC', case when i % 5 = 0 then 'A' when i % 2 = 0 then 'E' else 'D' end from generate_series(1, 400) i;
`);
await db.exec(ler("162_pe_fraco.sql"));
const antes = await q("select id, pe, pe_fraco from jogadores order by id");
await db.exec(ler("162_pe_fraco.sql")); // roda duas vezes
assert.deepStrictEqual(await q("select id, pe, pe_fraco from jogadores order by id"), antes);

for (const r of antes) assert.ok(r.pe === "A" ? r.pe_fraco >= 13 && r.pe_fraco <= 20 : r.pe_fraco >= 1 && r.pe_fraco <= 12, JSON.stringify(r));
assert.strictEqual(new Set(antes.filter(r => r.pe !== "A").map(r => r.pe_fraco)).size, 12, "os de um pé usam as 12 notas");
assert.strictEqual(new Set(antes.filter(r => r.pe === "A").map(r => r.pe_fraco)).size, 8, "os ambidestros usam as 8 notas");

const [novo] = await q("insert into jogadores (pos) values ('SC') returning pe, pe_fraco");
assert.deepStrictEqual([novo.pe, novo.pe_fraco >= 1 && novo.pe_fraco <= 12], ["D", true]);
const [dado] = await q("insert into jogadores (pos, pe, pe_fraco) values ('SC', 'A', 20) returning pe_fraco");
assert.strictEqual(dado.pe_fraco, 20, "quem já vem com a nota fica com ela");
console.log("pé fraco (SQL 162): ok");
