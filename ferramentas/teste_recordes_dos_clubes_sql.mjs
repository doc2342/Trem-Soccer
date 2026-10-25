// Confere o supabase/143_recordes_dos_clubes.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_recordes_dos_clubes_sql.mjs
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
create table jogadores (id bigint primary key, clube_id bigint, nome text, idade int, pos text, at smallint[]);
create table partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, publico int, fase text, grupo text);
create table resultados (partida_id bigint, libera_em timestamptz, gols_casa int, gols_fora int, relatorio jsonb);
create table historico (liga_id bigint, temporada int, clube_id bigint, grupo text, divisao int, posicao int, pontos int, gols_pro int);
create table estatisticas_historico (liga_id bigint, temporada int, comp text, dados jsonb, primary key (liga_id, temporada, comp));
create table jogadores_historico (liga_id bigint, temporada int, jogador_id bigint, clube_id bigint, idade smallint, pos text, at smallint[],
  jogos int, minutos int, gols int, ass int, nota numeric, primary key (liga_id, temporada, jogador_id));
create function estatisticas_da_liga(p_liga bigint, p_comp text) returns jsonb language sql as $$ select '{"jogos":0,"recordes":{}}'::jsonb $$;
create function numeros_dos_jogadores(p_liga bigint) returns table (jid text, jogos int, minutos int, gols int, ass int, nota numeric)
  language sql as $$ select null::text, 0, 0, 0, 0, null::numeric where false $$;
insert into ligas values (1, 5); insert into clubes values (1, 1), (2, 1), (3, 1);
insert into partidas values (10, 1, 1, 2, 9000, 'liga', 'A'), (11, 1, 2, 1, 30000, 'liga', 'A'), (12, 1, 3, 1, 5000, 'copa', null), (13, 1, 1, 3, 12000, 'liga', 'A');
insert into resultados values
  (10, now() - interval '1 h', 4, 0, '{"jogadores":[{"time":0,"nome":"Ze","nota":8.1,"minutos":90,"gols":3},{"time":1,"nome":"Rui","nota":6.0,"minutos":90}]}'),
  (11, now() - interval '1 h', 3, 3, '{"jogadores":[{"time":1,"nome":"Ze","nota":7.0,"minutos":90}]}'),
  (12, now() - interval '1 h', 0, 2, '{}'),
  (13, now() + interval '1 h', 9, 0, '{}'); -- ainda não liberado: não conta
`);
const sql = fs.readFileSync(new URL("../supabase/143_recordes_dos_clubes.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const r = (await q(`select recordes_dos_clubes(1) x`))[0].x;
assert.deepEqual([r["1"].goleada.id, r["1"].gols.id, r["1"].publico.publico, r["1"].nota.nome, r["1"].nota.nota], [10, 11, 9000, "Ze", 8.1], "clube 1");
assert.equal(r["2"].goleada, undefined, "clube 2 não venceu");
assert.equal(r["2"].publico.publico, 30000);
assert.equal(r["3"].publico.publico, 5000, "clube 3: o jogo em que era o dono da casa"); assert.equal(r["2"].publico.id, 11, "clube 2: só o jogo em casa");
assert.equal(r["1"].goleada.comp, "TODOS"); assert.equal(r["1"].publico.comp, "TODOS");
const so3 = (await q(`select recordes_dos_clubes(1, 3) x`))[0].x; assert.deepEqual(Object.keys(so3), ["3"], "só o clube pedido"); assert.equal(so3["3"].gols.comp, "COPA", "copa");
// guarda na virada e junta com a temporada atual
await q(`select guardar_estatisticas(1)`);
assert.equal(Object.keys((await q(`select dados from estatisticas_historico where comp = 'CLUBES'`))[0].dados).length, 3);
await db.exec(`update ligas set temporada = 6; delete from resultados where partida_id <> 12; delete from partidas where id <> 12;
  insert into partidas values (20, 1, 1, 2, 50000, 'liga', 'A'); insert into resultados values (20, now() - interval '1 h', 1, 0, '{}');`);
const d = (await q(`select recordes_da_liga(1, 1) x`))[0].x;
assert.deepEqual([d.goleada.gols_casa, d.goleada.temporada, d.publico.publico, d.publico.temporada, d.nota.nome, d.gols_jogo.temporada], [4, 5, 50000, 6, "Ze", 5]);
assert.equal((await q(`select recordes_da_liga(1) x`))[0].x.goleada, null, "liga inteira continua com os recordes da liga");
console.log("tudo certo");
