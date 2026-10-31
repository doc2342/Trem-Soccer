// Confere o supabase/167_obras_em_dias.sql num Postgres em memória (PGlite): obra nova ganha data de entrega pelo prazo em dias
// (no calendário de teste, o "dia" é o intervalo entre as rodadas 1 e 2), a obra de antes vira dias, o concluir_obras entrega só as
// vencidas e sobe o nível, e o arquivo roda duas vezes. Uso: node ferramentas/teste_obras_em_dias_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const sql = fs.readFileSync(new URL("../supabase/167_obras_em_dias.sql", import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table ligas (id bigint primary key);
create table clubes (id bigint primary key, liga_id bigint, ct_nivel int default 0, medico_nivel int default 0, fisio_nivel int default 0,
  base_nivel int default 0, estadio_nivel int default 1);
create table partidas (id int primary key, liga_id bigint, fase text, rodada int, inicio timestamptz);
create table obras (id int generated always as identity primary key, clube_id bigint, estrutura text, nivel_alvo int, custo int,
  rodadas_total int, rodadas_restantes int, concluida boolean default false);
create table resultados (partida_id int); create table divisoes (liga_id bigint); -- só para o %rowtype do lancar_rodada
insert into ligas values (1), (2);
insert into clubes (id, liga_id) values (1, 1), (2, 1), (3, 2), (4, 2);
-- liga 1: calendário de verdade (um dia entre as rodadas); liga 2: de teste (2 horas)
insert into partidas values (1, 1, 'liga', 1, now()), (2, 1, 'liga', 2, now() + interval '1 day'),
  (3, 2, 'liga', 1, now()), (4, 2, 'liga', 2, now() + interval '2 hours');
insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes) values (1, 'ct', 3, 1000, 6, 3); -- de antes, em rodadas
`);
await db.exec(sql); await db.exec(sql); // roda duas vezes
const horas = async id => Number((await q(`select round(extract(epoch from termina_em - now()) / 3600) h from obras where id = ${id}`))[0].h);
// a de antes: 3 rodadas que faltavam viram 4 dias (3 × 28/22), uma vez só
assert.deepEqual(await q(`select rodadas_total, rodadas_restantes from obras where id = 1`), [{ rodadas_total: 8, rodadas_restantes: 4 }]);
assert.equal(await horas(1), 96);
assert.deepEqual((await q(`select array_agg(prazo_da_obra(n) order by n) a from generate_series(1, 8) n`))[0].a, [1, 4, 8, 14, 23, 28, 34, 46]);
// obra nova: 8 dias de 24 h na liga 1, 8 "dias" de 2 h na liga 2
await q(`insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes) values
  (2, 'base', 3, 1000, prazo_da_obra(3), prazo_da_obra(3)), (3, 'estadio', 2, 1500, prazo_da_obra(3), prazo_da_obra(3))`);
assert.equal(await horas(2), 192);
assert.equal(await horas(3), 16);
// vence a da liga 2 e a de antes; a do clube 2 fica, com os dias que faltam recontados
await q(`update obras set termina_em = now() - interval '1 minute' where id in (1, 3)`);
await q(`update obras set termina_em = now() + interval '2 days 1 hour' where id = 2`);
assert.equal((await q(`select concluir_obras() n`))[0].n, 2);
assert.deepEqual(await q(`select id, concluida, rodadas_restantes from obras order by id`),
  [{ id: 1, concluida: true, rodadas_restantes: 0 }, { id: 2, concluida: false, rodadas_restantes: 3 }, { id: 3, concluida: true, rodadas_restantes: 0 }]);
assert.deepEqual(await q(`select id, ct_nivel, base_nivel, estadio_nivel from clubes where id < 4 order by id`),
  [{ id: 1, ct_nivel: 3, base_nivel: 0, estadio_nivel: 1 }, { id: 2, ct_nivel: 0, base_nivel: 0, estadio_nivel: 1 }, { id: 3, ct_nivel: 0, base_nivel: 0, estadio_nivel: 2 }]);
assert.equal((await q(`select concluir_obras() n`))[0].n, 0);
console.log("teste_obras_em_dias_sql: ok");
