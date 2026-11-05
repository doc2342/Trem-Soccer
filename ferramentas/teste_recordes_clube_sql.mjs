// Confere a parte 1 do supabase/175_recordes_e_evolucao.sql (recordes do clube: garçons, defesas, jogos sem sofrer gol, maior nota média)
// num Postgres em memória (PGlite). Uso: node ferramentas/teste_recordes_clube_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
create table admin_flag (sim boolean); insert into admin_flag values (true);
create function eh_admin() returns boolean language sql as $$ select sim from admin_flag $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint);
create table jogadores (id bigint primary key, clube_id bigint, nome text, idade int, pos text, at smallint[], exp numeric, livre_liga bigint);
create table partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, publico int, fase text, grupo text);
create table resultados (partida_id bigint, libera_em timestamptz, gols_casa int, gols_fora int, relatorio jsonb);
create table historico (liga_id bigint, temporada int, clube_id bigint, grupo text, divisao int, posicao int, pontos int, gols_pro int);
create table estatisticas_historico (liga_id bigint, temporada int, comp text, dados jsonb, primary key (liga_id, temporada, comp));
create table jogadores_historico (liga_id bigint, temporada int, jogador_id bigint, clube_id bigint, idade smallint, pos text, at smallint[],
  jogos int, minutos int, gols int, ass int, nota numeric, primary key (liga_id, temporada, jogador_id));
create function estatisticas_da_liga(p_liga bigint, p_comp text) returns jsonb language sql as $$ select '{"jogos":0,"recordes":{}}'::jsonb $$;
create table reinicios (liga_id bigint, estado_inicial jsonb);
`);
for (const f of ["84_historico_dos_jogadores.sql", "143_recordes_dos_clubes.sql"]) await db.exec(fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8").replace(/create table if not exists public\.jogadores_historico[\s\S]*?\);\n/, ""));
await db.exec(`
insert into ligas values (1, 5); insert into clubes values (1, 1), (2, 1);
insert into jogadores values (1, 1, 'g1', 25, 'GK', '{}', 10), (2, 1, 'a1', 22, 'ST', '{}', 10), (3, 2, 'b1', 24, 'MC', '{}', 10);
insert into partidas values (10, 1, 1, 2, 9000, 'liga', 'A'), (11, 1, 2, 1, 8000, 'liga', 'A');
insert into resultados values
  (10, now() - interval '1 h', 1, 0, '{"jogadores":[{"id":"j1","time":0,"nome":"g1","pos":"GK","nota":7.5,"minutos":90,"defesas":3,"sofridos":0},
    {"id":"j2","time":0,"nome":"a1","pos":"ST","nota":7,"minutos":90,"gols":1,"assistencias":1},
    {"id":"j3","time":1,"nome":"b1","pos":"MC","nota":6,"minutos":90,"assistencias":5}]}'),
  (11, now() - interval '1 h', 2, 1, '{"jogadores":[{"id":"j1","time":1,"nome":"g1","pos":"GK","nota":5.5,"minutos":90,"defesas":4,"sofridos":2},
    {"id":"j2","time":1,"nome":"a1","pos":"ST","nota":6.5,"minutos":90,"assistencias":2}]}');
`);
const sql = fs.readFileSync(new URL("../supabase/175_recordes_e_evolucao.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const r = async (c = 1) => (await q(`select recordes_da_liga(1, ${c}) x`))[0].x;
let d = await r();
assert.deepEqual([d.assistencias[0].nome, d.assistencias[0].v], ["a1", 3], "garçom do clube");
assert.ok(!d.assistencias.some(x => x.nome === "b1"), "jogador do outro clube fora dos recordes do clube");
assert.equal(d.defesas[0].v, 7); assert.equal(d.sem_sofrer[0].v, 1);
assert.deepEqual(d.media, [], "ninguém com 10 jogos");
assert.equal((await q(`select recordes_da_liga(1) x`))[0].x.assistencias[0].nome, "b1", "liga inteira: b1 com 5");
// o b1 jogou um jogo pelo clube 1 antes de trocar: só esse conta para o clube 1
await db.exec(`insert into partidas values (12, 1, 1, 2, 100, 'liga', 'A'); insert into resultados values (12, now() - interval '1 h', 0, 0,
  '{"jogadores":[{"id":"j3","time":0,"nome":"b1","pos":"MC","nota":6,"minutos":90,"assistencias":1}]}');`);
d = await r();
assert.equal(d.assistencias.find(x => x.nome === "b1").v, 1, "b1 pelo clube 1: só a assistência por ele");
// a1 com 10 jogos guardados de outra temporada: entra na maior nota média
await db.exec(`insert into jogadores_historico (liga_id, temporada, jogador_id, clube_id, jogos, minutos, gols, ass, nota, defesas, sem_sofrer) values (1, 4, 2, 1, 10, 900, 4, 3, 7.0, 0, 0);`);
d = await r();
assert.equal(d.media[0].nome, "a1"); assert.equal(d.media[0].jogos, 12); assert.equal(d.media[0].v, 6.96, "(7 × 10 + 7 + 6,5) / 12");
assert.equal(d.assistencias[0].v, 6, "3 guardadas + 3 da temporada atual");
// guardar_estatisticas grava defesas e jogos sem sofrer gol
await q(`select guardar_estatisticas(1)`);
const g = (await q(`select defesas, sem_sofrer from jogadores_historico where temporada = 5 and jogador_id = 1`))[0];
assert.deepEqual([g.defesas, g.sem_sofrer], [7, 1]);
console.log("tudo certo");
