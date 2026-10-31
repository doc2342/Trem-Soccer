// Confere o supabase/169_estadio_em_paralelo.sql num Postgres em memória (PGlite): prazos novos, o desconto de 1 dia nas obras em
// andamento só na primeira vez (o arquivo roda duas vezes) e o índice de dois canteiros: uma estrutura e o estádio juntos, nunca duas
// estruturas nem duas do estádio. Uso: node ferramentas/teste_estadio_em_paralelo_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const sql = fs.readFileSync(new URL("../supabase/169_estadio_em_paralelo.sql", import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table ligas (id bigint primary key);
create table clubes (id bigint primary key, liga_id bigint);
create table obras (id int generated always as identity primary key, clube_id bigint, estrutura text, nivel_alvo int, custo int,
  rodadas_total int, rodadas_restantes int, concluida boolean default false, termina_em timestamptz);
create unique index obras_uma_por_clube on obras (clube_id) where not concluida;
create function horas_do_dia(p_liga bigint) returns numeric language sql as $$ select 24::numeric $$;
insert into ligas values (1); insert into clubes values (1, 1), (2, 1);
insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes, termina_em) values
  (1, 'ct', 2, 500, 4, 3, now() + interval '3 days'), (2, 'base', 1, 250, 1, 1, now() + interval '12 hours');
`);
await db.exec(sql); await db.exec(sql); // roda duas vezes: o desconto só na primeira
assert.deepEqual((await q(`select array_agg(prazo_da_obra(n) order by n) a from generate_series(1, 8) n`))[0].a, [1, 3, 6, 10, 15, 21, 30, 42]);
assert.deepEqual(await q(`select clube_id, rodadas_restantes r, round(extract(epoch from termina_em - now()) / 3600) h from obras order by id`),
  [{ clube_id: 1, r: 2, h: "48" }, { clube_id: 2, r: 0, h: "-12" }]); // a do clube 2 venceu: o concluir_obras entrega no minuto seguinte
// clube 1 tem obra de estrutura: o estádio entra, outra estrutura não, outra do estádio também não
await q(`insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes) values (1, 'estadio', 2, 1500, 3, 3)`);
await assert.rejects(q(`insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes) values (1, 'medico', 1, 250, 1, 1)`), /obras_uma_por_canteiro/);
await assert.rejects(q(`insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes) values (1, 'estadio_modelo', 8, 15000, 21, 21)`), /obras_uma_por_canteiro/);
console.log("teste_estadio_em_paralelo_sql: ok");
