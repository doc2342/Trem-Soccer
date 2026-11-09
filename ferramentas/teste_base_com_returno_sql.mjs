// Confere o supabase/178_base_com_returno.sql (PGlite): a liga de base espelha todas as rodadas da liga (turno e returno), na mesma hora,
// só grupos do Brasil, não mexe na Copinha, não refaz temporada com jogo processado e roda duas vezes.
// Uso: node ferramentas/teste_base_com_returno_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table ligas (id bigint primary key, temporada int);
create table partidas (id bigint generated always as identity, liga_id bigint, grupo text, rodada int, casa bigint, fora bigint, inicio timestamptz, fase text);
create table base_jogos (id bigint generated always as identity, liga_id bigint, temporada int, grupo text, rodada int, casa bigint, fora bigint, inicio timestamptz,
  processada boolean not null default false, fase text);
create function pais_do_grupo(g text) returns text language sql as $$ select case when g = 'ARG' then 'Argentina' else 'Brasil' end $$;
insert into ligas values (1, 3);
insert into partidas (liga_id, grupo, rodada, casa, fora, inicio, fase)
  select 1, g, r, 1, 2, '2026-11-01'::timestamptz + (r || ' days')::interval, 'liga' from generate_series(1, 18) r, (values ('B'), ('ARG')) v(g);
insert into partidas (liga_id, grupo, rodada, casa, fora, inicio, fase) values (1, 'COPA', 1, 1, 2, now(), 'copa');
insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase) values (1, 3, 'COPINHA', 101, 1, 2, now(), 'copinha');
`);
const sql = fs.readFileSync(new URL("../supabase/178_base_com_returno.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql);
assert.strictEqual((await q(`select montar_liga_de_base(1) as n`))[0].n, 18);
assert.strictEqual((await q(`select montar_liga_de_base(1) as n`))[0].n, 18, "refaz sem duplicar enquanto nada foi jogado");
const base = await q(`select b.rodada, b.inicio = p.inicio as mesma from base_jogos b join partidas p on p.grupo = b.grupo and p.rodada = b.rodada where b.fase is null order by 1`);
assert.deepStrictEqual(base.map(x => x.rodada), Array.from({ length: 18 }, (_, i) => i + 1));
assert.ok(base.every(x => x.mesma), "na mesma hora da rodada da liga");
assert.strictEqual((await q(`select count(*)::int as n from base_jogos where fase = 'copinha'`))[0].n, 1, "a Copinha fica");
await q(`update base_jogos set processada = true where rodada = 1 and fase is null`);
assert.strictEqual((await q(`select montar_liga_de_base(1) as n`))[0].n, 0, "temporada em andamento não é refeita");
console.log("base com returno (178): ok");
