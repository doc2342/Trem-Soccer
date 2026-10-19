// Confere o supabase/134_socio_torcedor_automatico.sql num Postgres em memória (PGlite), em cima do lancar_rodada do 132 (que perdeu os
// remendos do 114, 115 e 122): os remendos voltam, os sócios entram na primeira partida de liga e pagam meio ingresso por rodada.
// Uso: node ferramentas/teste_socios_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const pasta = new URL("../supabase/", import.meta.url), arquivos = fs.readdirSync(pasta).filter(f => /^\d+_.*\.sql$/.test(f) && parseInt(f) < 133).sort((a, b) => parseInt(a) - parseInt(b));
const definicao = nome => { let achou = null;
  for (const f of arquivos) { const s = fs.readFileSync(new URL(f, pasta), "utf8"), re = new RegExp(`create or replace function public\\.${nome}\\(.*?\\$\\$.*?\\$\\$;`, "gs"); let m; while ((m = re.exec(s))) achou = m[0]; }
  assert.ok(achou, nome); return achou; };
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
set check_function_bodies = off;
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select 'service_role' $$;
create function eh_admin() returns boolean language sql as $$ select true $$;
create table ligas (id bigint primary key, temporada int, rodadas_por_temporada int default 22, receita_tv int, receita_patrocinio int, preco_ingresso int, torcida_base int, fundo_taca int default 0);
create table divisoes (liga_id bigint, divisao int, receita_tv int, receita_patrocinio int, preco_ingresso int, torcida_base int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, divisao int, dono uuid, nome text, estadio_nivel int, torcida int, humor numeric, carne int default 0,
  carne_temporada int, paraquedas int, vermelho_rodadas int default 0, ct_nivel int, medico_nivel int, fisio_nivel int, base_nivel int);
create table partidas (id bigint primary key, liga_id bigint, grupo text, rodada int, fase text, casa bigint, fora bigint, publico int, financeiro boolean default false,
  vencedor bigint, sede text, copa_fase int);
create table resultados (partida_id bigint, gols_casa int, gols_fora int, relatorio jsonb);
create table obras (id serial, clube_id bigint, concluida boolean, rodadas_restantes int, estrutura text, nivel_alvo int);
create table financas (clube_id bigint primary key, caixa int);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create table finais_nas_sedes (partida_id bigint primary key);
create function folha_do_clube(bigint) returns int language sql as $$ select 2200 $$;
create function manutencao_por_temporada(bigint) returns int language sql as $$ select 0 $$;
create function lugares_do_estadio(int) returns int language sql as $$ select case when $1 <= 5 then 5000 + 5000 * $1 else 30000 + 10000 * ($1 - 5) end $$;
create function preco_do_jogo(bigint) returns numeric language sql as $$ select 1.0 $$;
create function atracao_do_jogo(bigint) returns numeric language sql as $$ select 1.0 $$;
create function bonus_do_estadio(int) returns numeric language sql as $$ select 1.0 $$;
create function teto_do_clube(bigint) returns int language sql as $$ select 20000 $$;
create function base_da_torcida(bigint) returns int language sql as $$ select 50000 $$;
create function venda_forcada(bigint) returns void language sql as $$ select $$;
create function rodadas_do_grupo(bigint, text) returns int language sql as $$ select 22 $$;
create function patrocinio_semanal(bigint, int, int) returns int language sql as $$ select null::int $$;
create function rotulo_patrocinio(bigint, int) returns text language sql as $$ select 'Patrocínio' $$;
`);
for (const f of ["comida_por_torcedor", "estacionamento_do_estadio", "custo_de_operacao", "lugares_da_sede", "chave_da_final", "definir_publico", "lancar_rodada"]) await db.exec(definicao(f));
const antes = (await q(`select prosrc from pg_proc where proname = 'lancar_rodada'`))[0].prosrc;
assert.ok(antes.includes("lugares_da_sede") && !antes.includes("patrocinio_semanal"), "o teste parte do lancar_rodada do 132, sem os remendos");

const sql = fs.readFileSync(new URL("134_socio_torcedor_automatico.sql", pasta), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const src = (await q(`select prosrc from pg_proc where proname = 'lancar_rodada'`))[0].prosrc;
for (const t of ["rodadas_do_grupo", "patrocinio_semanal", "custo_de_operacao", "garantir_socios", "pagar_socios"]) assert.equal(src.split(t).length > 1, true, t);
for (const t of ["custo_de_operacao(v_c", "pagar_socios(", "garantir_socios(v_p.fora)"]) assert.equal(src.split(t).length, 2, t + " entrou duas vezes");
assert.ok((await q(`select prosrc from pg_proc where proname = 'definir_publico'`))[0].prosrc.includes("garantir_socios"));

// Clube 1: torcida 40 mil, humor 16 → 30% = 12 mil sócios (estádio nível 5 = 30 mil, metade = 15 mil). Clube 2: humor 0 → 10% de 20 mil = 2 mil.
// Clube 3 já abriu à mão nesta temporada (5 mil, pagos de uma vez): fica como está e não recebe parcela. Clube 4 é da Argentina: sem sócios.
await db.exec(`
insert into ligas (id, temporada, receita_tv, receita_patrocinio, preco_ingresso, torcida_base) values (1, 14, 6600, 5500, 25, 20000);
insert into divisoes values (1, 1, 6600, 5500, 25, 20000);
insert into clubes (id, liga_id, grupo, divisao, estadio_nivel, torcida, humor, carne, carne_temporada) values
  (1, 1, 'A', 1, 5, 40000, 16, 0, 13), (2, 1, 'A', 1, 1, 20000, 0, 0, null), (3, 1, 'A', 1, 5, 30000, 8, 5000, 14), (4, 1, 'ARG', 1, 5, 30000, 8, 0, null);
insert into financas values (1, 0), (2, 0), (3, 0), (4, 0);
insert into partidas (id, liga_id, grupo, rodada, fase, casa, fora, publico) values
  (10, 1, 'A', 1, 'liga', 2, 1, 1000), (11, 1, 'A', 2, 'liga', 1, 3, null), (12, 1, 'COPA', 101, 'copa', 1, 2, null), (13, 1, 'ARG', 1, 'liga', 4, 4, null);
insert into resultados values (10, 0, 0, '{}'), (11, 0, 0, '{}'), (12, 0, 0, '{}'), (13, 0, 0, '{}');`);
for (const p of [10, 11, 12, 13, 10]) await q(`select lancar_rodada($1)`, [p]);
const socios = Object.fromEntries((await q(`select id::int, carne, carne_temporada t, socios_auto a from clubes order by id`)).map(r => [r.id, r]));
assert.deepEqual([socios[1].carne, socios[1].t, socios[1].a], [12000, 14, true]);
assert.deepEqual([socios[2].carne, socios[2].a], [2000, true]);
assert.deepEqual([socios[3].carne, socios[3].a], [5000, false], "quem abriu à mão fica como está");
assert.deepEqual([socios[4].carne, socios[4].a], [0, false], "clube de fora não tem sócios");
// o público já definido (1.000) sobe para os 2.000 sócios do mandante, que não pagam de novo na bilheteria
assert.equal((await q(`select publico from partidas where id = 10`))[0].publico, 2000);
assert.match((await q(`select descricao from lancamentos where clube_id = 2 and tipo = 'bilheteria'`))[0].descricao, /^Bilheteria \(0 pagantes e 2000 sócios/);
// parcela por rodada de liga: meio ingresso por sócio, menos 10%. Clube 1: 12.000 × 25 / 2000 = 150 mil − 15 = 135; clube 2: 25 − 3 (arredonda) = 22
const parcelas = await q(`select clube_id::int c, rodada, valor from lancamentos where tipo = 'carne' order by clube_id, rodada`);
assert.deepEqual(parcelas, [{ c: 1, rodada: 1, valor: 135 }, { c: 1, rodada: 2, valor: 135 }, { c: 2, rodada: 1, valor: 22 }]);
const fundo = (await q(`select fundo_taca from ligas`))[0].fundo_taca;
assert.ok(fundo >= 15 + 15 + 3, "os 10% dos sócios vão para o fundo");
for (const c of [1, 2, 3]) assert.equal((await q(`select caixa from financas where clube_id = $1`, [c]))[0].caixa,
  (await q(`select coalesce(sum(valor), 0)::int s from lancamentos where clube_id = $1`, [c]))[0].s, "o caixa bate com os lançamentos do clube " + c);
// o botão antigo recusa
await assert.rejects(q(`select definir_carne(1000)`), /automático/);
console.log("SQL 134 ok");
