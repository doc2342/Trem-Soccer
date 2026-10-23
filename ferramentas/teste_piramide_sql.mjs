// Confere o supabase/114_piramide_t14.sql num Postgres em memória (PGlite): as funções trocadas no lugar (rodadas do grupo, Copinha e
// bots sem os guardados), a liga de base com o turno de cada grupo, o preço do playoff, o gatilho do guardado e o prestígio.
// As funções originais vêm dos próprios arquivos do repositório (a última definição de cada uma). Uso: node ferramentas/teste_piramide_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const pasta = new URL("../supabase/", import.meta.url), arquivos = fs.readdirSync(pasta).filter(f => /^\d+_.*\.sql$/.test(f) && parseInt(f) < 114).sort((a, b) => parseInt(a) - parseInt(b));
// a última definição de cada função nos arquivos anteriores ao 114 (as posteriores já trazem o remendo)
const definicao = nome => { let achou = null;
  for (const f of arquivos) { const s = fs.readFileSync(new URL(f, pasta), "utf8"), re = new RegExp(`create or replace function public\\.${nome}\\(.*?\\$\\$.*?\\$\\$;`, "gs"); let m; while ((m = re.exec(s))) achou = m[0]; }
  assert.ok(achou, nome); return achou; };
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
set check_function_bodies = off;
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select 'service_role' $$; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function eh_admin() returns boolean language sql as $$ select true $$;
create table ligas (id bigint primary key, temporada int, rodadas_por_temporada int default 18, copa jsonb, preco_ingresso int, torcida_base int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, pais text default 'Brasil', dono uuid, divisao int, torcida_fator numeric default 1, torcida_fator_temporada int, carne int, carne_temporada int);
create table partidas (id serial primary key, liga_id bigint, grupo text, rodada int, fase text, copa_fase int, casa bigint, fora bigint, inicio timestamptz, processada boolean default false);
create table resultados (partida_id int); create table divisoes (liga_id bigint, divisao int, torcida_base int, preco_ingresso int);
create table base_jogos (id serial primary key, liga_id bigint, temporada int, grupo text, rodada int, casa bigint, fora bigint, inicio timestamptz, processada boolean default false, fase text, copinha_fase int, chave int);
create table jogadores (id serial primary key, clube_id bigint);
create table historico (liga_id bigint, temporada int, clube_id bigint, divisao int, posicao int, destino text, copa text);
`);
for (const f of ["pais_do_grupo", "lancar_rodada", "lancar_treinadores", "atracao_do_jogo", "definir_carne", "bots_investem", "montar_copinha", "montar_liga_de_base", "preco_do_jogo"]) await db.exec(definicao(f));
await db.exec(fs.readFileSync(new URL("114_piramide_t14.sql", pasta), "utf8"));
// as 4 funções da economia passam a usar as rodadas do grupo, e não sobra rodadas_por_temporada nelas
for (const r of await q(`select proname, prosrc from pg_proc where proname in ('lancar_rodada', 'lancar_treinadores', 'atracao_do_jogo', 'definir_carne')`)) {
  assert.ok(r.prosrc.includes("rodadas_do_grupo"), r.proname); assert.ok(!r.prosrc.includes("rodadas_por_temporada"), r.proname); }
for (const [f, t] of [["montar_copinha", "grupo <> 'X'"], ["bots_investem", "cl.grupo <> 'X'"]]) assert.ok((await q(`select prosrc from pg_proc where proname = $1`, [f]))[0].prosrc.includes(t), f);
assert.equal((await q(`select divisao_do_grupo('F') d`))[0].d, 2);

// liga: A com 12 (22 rodadas), B e F com 8 (14 rodadas), país com 10; guardado sem partida
await q(`insert into ligas (id, temporada) values (1, 14)`);
const tabela = async (grupo, ids) => { // turno e returno pelo método do círculo
  const n = ids.length, l = ids.slice();
  for (let r = 0; r < n - 1; r++) { for (let k = 0; k < n / 2; k++) { const [a, b] = [l[k], l[n - 1 - k]];
      await q(`insert into partidas (liga_id, grupo, rodada, fase, casa, fora, inicio) values (1, $1, $2, 'liga', $3, $4, now()), (1, $1, $5, 'liga', $4, $3, now())`, [grupo, r + 1, a, b, r + n]); }
    l.splice(1, 0, l.pop()); } };
await tabela("A", Array.from({ length: 12 }, (_, k) => k + 1));
await tabela("B", Array.from({ length: 8 }, (_, k) => k + 101));
await tabela("F", Array.from({ length: 8 }, (_, k) => k + 201));
await tabela("ARG", Array.from({ length: 10 }, (_, k) => k + 301));
assert.deepEqual((await q(`select rodadas_do_grupo(1, 'A') a, rodadas_do_grupo(1, 'B') b, rodadas_do_grupo(1, 'ARG') g, rodadas_do_grupo(1, 'COPA') c`))[0], { a: 22, b: 14, g: 18, c: 18 });
assert.equal((await q(`select montar_liga_de_base(1) n`))[0].n, 11 * 6 + 2 * 7 * 4); // o turno de cada grupo; o país fica fora
assert.deepEqual((await q(`select grupo, max(rodada)::int r, count(*)::int n from base_jogos group by grupo order by grupo`)), [{ grupo: "A", r: 11, n: 66 }, { grupo: "B", r: 7, n: 28 }, { grupo: "F", r: 7, n: 28 }]);
// cada par joga uma vez só no turno da base
assert.equal((await q(`select count(*)::int n from (select least(casa, fora), greatest(casa, fora) from base_jogos group by 1, 2 having count(*) > 1) x`))[0].n, 0);

// preço: preliminar e semifinal 1,25, final 1,5
await q(`insert into partidas (id, liga_id, grupo, rodada, fase, casa, fora) values (900, 1, 'B', 15, 'pre', 103, 106), (901, 1, 'B', 17, 'semi', 101, 105), (902, 1, 'B', 19, 'final', 101, 102)`);
assert.deepEqual((await q(`select preco_do_jogo(900)::float a, preco_do_jogo(901)::float b, preco_do_jogo(902)::float c`))[0], { a: 1.25, b: 1.25, c: 1.5 });
await assert.rejects(q(`insert into partidas (liga_id, grupo, rodada, fase, casa, fora) values (1, 'B', 15, 'pre', 103, 106)`), /duplicate|unique/);

// guardado congelado: jogador não sai nem entra; o resto segue
await q(`insert into clubes (id, liga_id, grupo) values (1, 1, 'A'), (2, 1, 'A'), (3, 1, 'X')`);
await q(`insert into jogadores (id, clube_id) values (1, 1), (2, 3)`);
await q(`update jogadores set clube_id = 2 where id = 1`);
await assert.rejects(q(`update jogadores set clube_id = 3 where id = 1`), /Clube guardado/);
await assert.rejects(q(`update jogadores set clube_id = 1 where id = 2`), /Clube guardado/);
await q(`delete from jogadores where id = 2`); // aposentadoria

// prestígio: na T14 o campeão da B é quem subiu; na T13, o 1º do grupo
await q(`insert into clubes (id, liga_id, grupo, divisao) values (10, 1, 'B', 2), (11, 1, 'B', 2), (12, 1, 'B', 2), (13, 1, 'B', 2)`);
await q(`insert into historico values (1, 14, 10, 2, 1, 'ficou', null), (1, 14, 11, 2, 4, 'subiu', null)`);
await q(`update ligas set temporada = 15`); await q(`select atualizar_torcidas(1)`);
assert.deepEqual((await q(`select id, torcida_fator::float f from clubes where id in (10, 11) order by id`)).map(x => x.f), [1, 1.03]);
await q(`insert into historico values (1, 15, 12, 2, 1, 'ficou', null), (1, 15, 13, 2, 4, 'subiu', null)`);
await q(`update ligas set temporada = 14`); await q(`update historico set temporada = 13 where clube_id in (12, 13)`); await q(`select atualizar_torcidas(1)`);
assert.deepEqual((await q(`select torcida_fator::float f from clubes where id in (12, 13) order by id`)).map(x => x.f), [1.03, 1]);
console.log("SQL 114 ok");
