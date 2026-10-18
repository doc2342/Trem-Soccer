// Confere o supabase/122_imposto_em_faixas_e_operacao.sql num Postgres em memória (PGlite): imposto em faixas, custo de operação
// por torcedor e o remendo do lancar_rodada (que também devolve os trechos do 114 e do 115). Uso: node ferramentas/teste_operacao_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
import { impostoDoLucro, custoDeOperacao } from "../src/economia.js";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const pasta = new URL("../supabase/", import.meta.url), arquivos = fs.readdirSync(pasta).filter(f => /^\d+_.*\.sql$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
const definicao = nome => { let achou = null;
  for (const f of arquivos) { const s = fs.readFileSync(new URL(f, pasta), "utf8"), re = new RegExp(`create or replace function public\\.${nome}\\(.*?\\$\\$.*?\\$\\$;`, "gs"); let m; while ((m = re.exec(s))) achou = m[0]; }
  assert.ok(achou, nome); return achou; };
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
set check_function_bodies = off;
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select 'service_role' $$;
create function eh_admin() returns boolean language sql as $$ select true $$;
create table ligas (id bigint primary key, temporada int, rodadas_por_temporada int default 18, receita_tv int, receita_patrocinio int, preco_ingresso int, torcida_base int, fundo_taca int default 0);
create table divisoes (liga_id bigint, divisao int, receita_tv int, receita_patrocinio int, preco_ingresso int, torcida_base int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, divisao int, dono uuid, estadio_nivel int, torcida int, humor numeric, carne int default 0,
  carne_temporada int, paraquedas int, vermelho_rodadas int default 0, ct_nivel int, medico_nivel int, fisio_nivel int, base_nivel int);
create table partidas (id bigint primary key, liga_id bigint, grupo text, rodada int, fase text, casa bigint, fora bigint, publico int, financeiro boolean default false, vencedor bigint);
create table resultados (partida_id bigint, gols_casa int, gols_fora int, relatorio jsonb);
create table obras (id serial, clube_id bigint, concluida boolean, rodadas_restantes int, estrutura text, nivel_alvo int);
create table financas (clube_id bigint primary key, caixa int);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create function folha_do_clube(bigint) returns int language sql as $$ select 2200 $$;
create function manutencao_por_temporada(bigint) returns int language sql as $$ select 0 $$;
create function lugares_do_estadio(int) returns int language sql as $$ select 60000 $$;
create function preco_do_jogo(bigint) returns numeric language sql as $$ select 1.0 $$;
create function teto_do_clube(bigint) returns int language sql as $$ select 20000 $$;
create function base_da_torcida(bigint) returns int language sql as $$ select 50000 $$;
create function venda_forcada(bigint) returns void language sql as $$ select $$;
create function rodadas_do_grupo(bigint, text) returns int language sql as $$ select 22 $$;
create function patrocinio_semanal(bigint, int, int) returns int language sql as $$ select null::int $$;
create function rotulo_patrocinio(bigint, int) returns text language sql as $$ select 'Patrocínio' $$;
`);
for (const f of ["comida_por_torcedor", "estacionamento_do_estadio", "lancar_rodada"]) await db.exec(definicao(f));
const sql = fs.readFileSync(new URL("122_imposto_em_faixas_e_operacao.sql", pasta), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const src = (await q(`select prosrc from pg_proc where proname = 'lancar_rodada'`))[0].prosrc;
for (const t of ["rodadas_do_grupo", "patrocinio_semanal", "rotulo_patrocinio", "custo_de_operacao"]) assert.ok(src.includes(t), t);
assert.ok(!src.includes("rodadas_por_temporada)"), "sobrou divisão por rodadas_por_temporada");
assert.equal(src.split("custo_de_operacao").length, 2, "o remendo não pode entrar duas vezes");

// imposto: o mesmo no SQL e no JS (teto 20 mi: isento até 5, 20% até 10, 35% até 20, 50% acima)
for (const [l, esperado] of [[4000, 0], [5000, 0], [10000, 1000], [20000, 4500], [30000, 9500], [-3000, 0]]) {
  assert.equal((await q(`select imposto_do_lucro($1, 20000) v`, [l]))[0].v, esperado, "SQL " + l);
  assert.equal(impostoDoLucro(l, 20000), esperado, "JS " + l); }
for (const n of [1, 4, 5, 8]) assert.equal(+(await q(`select custo_de_operacao($1) v`, [n]))[0].v, custoDeOperacao(n), "nível " + n);
assert.deepEqual([1, 4, 5, 8, 9].map(custoDeOperacao), [0.1, 1.6, 2.5, 6.4, 6.4]);

// jogo de liga com 60 mil no nível 8: o mandante paga 384 mil; o visitante nada
await db.exec(`
insert into ligas (id, temporada, receita_tv, receita_patrocinio, preco_ingresso, torcida_base) values (1, 14, 6000, 5000, 25, 20000);
insert into divisoes values (1, 1, 6000, 5000, 25, 20000);
insert into clubes (id, liga_id, grupo, divisao, estadio_nivel, torcida, humor) values (1, 1, 'A', 1, 8, 60000, 8), (2, 1, 'A', 1, 5, 25000, 8);
insert into financas values (1, 0), (2, 0);
insert into partidas values (10, 1, 'A', 1, 'liga', 1, 2, 60000), (11, 1, 'COPA', 101, 'copa', 1, 2, 60000);
insert into resultados values (10, 1, 0, '{}'), (11, 1, 0, '{}');`);
await q(`select lancar_rodada(10)`); await q(`select lancar_rodada(11)`); await q(`select lancar_rodada(10)`); // a segunda vez não lança de novo
const op = await q(`select clube_id::int c, rodada, valor from lancamentos where tipo = 'operacao' order by rodada, clube_id`);
assert.deepEqual(op, [{ c: 1, rodada: 1, valor: -384 }, { c: 1, rodada: 101, valor: -192 }, { c: 2, rodada: 101, valor: -192 }]);
// TV dividida pelas 22 rodadas do grupo (114)
assert.equal((await q(`select valor from lancamentos where tipo = 'tv' and clube_id = 1`))[0].valor, Math.round(6000 / 22));
const caixa = (await q(`select caixa from financas where clube_id = 1`))[0].caixa, soma = (await q(`select sum(valor)::int s from lancamentos where clube_id = 1`))[0].s;
assert.equal(caixa, soma, "o caixa bate com os lançamentos");
console.log("SQL 122 ok");
