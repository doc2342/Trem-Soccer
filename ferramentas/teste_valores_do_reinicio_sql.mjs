// Confere o supabase/150_valores_do_reinicio.sql num Postgres em memória (PGlite): tetos novos, agente pago pelo fundo (sem deixá-lo negativo),
// 6 vendas, metade da TV e do patrocínio para o clube sem dono, imposto do caixa dos bots para o fundo e o arquivo rodando duas vezes.
// As funções remendadas são stubs com as mesmas linhas da versão no ar. Uso: node ferramentas/teste_valores_do_reinicio_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const ler = f => fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
set check_function_bodies = off;
create role anon; create role authenticated; create role service_role;
create table ligas (id bigint primary key, temporada int, fundo_taca int, teto_folha int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, dono uuid, pais text, divisao int, paraquedas int);
create table divisoes (liga_id bigint, divisao int, teto_folha int);
create table financas (clube_id bigint primary key, caixa int);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create table transferencias (janela text);
insert into ligas values (1, 3, 40000, 14000);
insert into divisoes values (1, 1, 20000), (1, 2, 16000);
insert into clubes values (1, 1, 'A', '00000000-0000-0000-0000-000000000001', 'Brasil', 1, null), (2, 1, 'B', null, 'Brasil', 2, null),
  (3, 1, 'C', null, 'Brasil', 2, null), (4, 1, 'ARG', null, 'Argentina', 1, null), (5, 1, 'X', null, 'Brasil', 2, null);
insert into financas values (1, 50000), (2, 25000), (3, 10000), (4, 29000), (5, 99999);
`);
await db.exec(ler("53_fundo_da_liga.sql")); // fundo_resumo e o gatilho que anota de onde veio cada mudança do fundo
// versões "no ar" (só as linhas que o 150 remenda, com o mesmo texto)
await db.exec(`
create or replace function vender_pelo_agente(p_jogador bigint) returns text language plpgsql security definer set search_path = public as $f$
declare v_l ligas%rowtype; v_valor int; v_mercado int := 1000; v_j record;
begin
  select * into v_l from ligas where id = 1; select 'Fulano'::text as nome into v_j; v_valor := p_jogador;
  if (select count(*) from transferencias where true and janela is distinct from 'saida') >= 4 then
    raise exception 'Você já fez 4 vendas pelo agente nesta temporada.';
  end if;
  v_valor := pagar_pelos_bots(v_l.id, v_valor, 'Compra pelo agente: ' || v_j.nome); -- quem paga são os clubes sem dono; sem caixa neles, o valor encolhe
  return v_valor::text;
end $f$;
create or replace function venda_automatica(p_jogador bigint, p_descricao text) returns integer language plpgsql security definer set search_path = public as $f$
declare v_l ligas%rowtype; v_mercado int := 1000; v_valor int; v_j record;
begin
  select * into v_l from ligas where id = 1; select 'Fulano'::text as nome into v_j;
  v_valor := pagar_pelos_bots(v_l.id, round(v_mercado * (1 + 2 * cotacao_do_agente(v_l.id)))::int, 'Compra pelo agente: ' || v_j.nome);
  return v_valor;
end $f$;
create or replace function lancar_rodada(p_partida bigint) returns void language plpgsql security definer set search_path = public as $f$
declare
  v_tv int; v_pat int; v_folha int := 0; v_manut int := 0; v_total int; v_clube bigint;
  v_sede text; v_nome_sede text; v_pc numeric;
begin
  v_tv := 100;
  foreach v_clube in array array[1, 2] loop
      v_pat := 80;
      v_total := v_tv + v_pat - v_folha - v_manut;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_clube, 3, 1, 'tv', v_tv, 'Cota de TV'),
        (v_clube, 3, 1, 'patrocinio', v_pat, 'Patrocínio');
      update financas set caixa = caixa + v_total where clube_id = v_clube;
  end loop;
end $f$;
create or replace function virar_temporada(p_liga bigint, p_plano jsonb) returns text language plpgsql security definer set search_path = public as $f$
declare v_l ligas%rowtype;
begin
  select * into v_l from ligas where id = p_liga for update;
  -- 3. imposto sobre o lucro da temporada
  -- 4. jogadores: quem fica, quem se aposenta, quem chega
  return 'ok';
end $f$;
create or replace function pagar_pelos_bots(p_liga bigint, p_valor integer, p_descricao text) returns integer language sql as $f$ select 0 $f$;
`);
const sql = ler("150_valores_do_reinicio.sql");
await db.exec(sql);
await db.exec(sql); // idempotente: o segundo não remenda de novo

// tetos
assert.deepEqual((await q(`select divisao, teto_folha from divisoes order by divisao`)).map(r => [r.divisao, r.teto_folha]), [[1, 19000], [2, 15000]]);
assert.deepEqual((await q(`select id, teto_do_clube(id) as t from clubes where id in (1, 2, 4) order by id`)).map(r => r.t), [19000, 15000, 19000]);
assert.equal((await q(`select count(*)::int as n from pg_proc where proname = 'pagar_pelos_bots'`))[0].n, 0);

// cotação: fundo ÷ (2 mi por dirigente), de 0 a 1 (1 dirigente: 40 mi dá 1; 1 mi dá 0,5)
assert.equal(+(await q(`select cotacao_do_agente(1) as c`))[0].c, 1);

// imposto do caixa: bot da B (25 mi, teto 15) paga 3 mi; bot de país (29 mi, teto 19) paga 3 mi; dono, bot abaixo do teto e guardado não pagam
await q(`select virar_temporada(1, '{}')`);
const caixa = Object.fromEntries((await q(`select clube_id, caixa from financas`)).map(r => [r.clube_id, r.caixa]));
assert.deepEqual(caixa, { 1: 50000, 2: 22000, 3: 10000, 4: 26000, 5: 99999 });
assert.equal((await q(`select fundo_taca from ligas`))[0].fundo_taca, 46000);
assert.deepEqual(await q(`select temporada, tipo, valor from fundo_resumo`), [{ temporada: 3, tipo: "imposto_do_caixa", valor: 6000 }]);
assert.equal((await q(`select count(*)::int as n from lancamentos where tipo = 'imposto'`))[0].n, 2);

// agente pago pelo fundo: com saldo, paga o preço cheio; curto, o fundo vai a zero e o vendedor recebe ao menos o mercado (1 mi)
assert.equal((await q(`select vender_pelo_agente(3000) as v`))[0].v, "3000");
assert.equal((await q(`select fundo_taca from ligas`))[0].fundo_taca, 43000);
await q(`update ligas set fundo_taca = 500`);
assert.equal((await q(`select vender_pelo_agente(3000) as v`))[0].v, "1000");
assert.equal((await q(`select fundo_taca from ligas`))[0].fundo_taca, 0);
assert.equal((await q(`select vender_pelo_agente(3000) as v`))[0].v, "1000");
assert.equal((await q(`select fundo_taca from ligas`))[0].fundo_taca, 0, "o fundo nunca fica negativo");
assert.equal(+(await q(`select cotacao_do_agente(1) as c`))[0].c, 0);
assert.equal((await q(`select venda_automatica(1, 'x') as v`))[0].v, 1000); // fundo vazio: cotação 0 e só o mercado
const agente = (await q(`select valor from fundo_resumo where tipo = 'agente'`))[0];
assert.equal(agente.valor, -3500);
// 6 vendas por temporada
await q(`insert into transferencias select null from generate_series(1, 5)`);
await q(`select vender_pelo_agente(10)`);
await q(`insert into transferencias values (null)`);
await assert.rejects(q(`select vender_pelo_agente(10)`), /6 vendas/);

// rodada: o clube sem dono (2) recebe metade da TV e do patrocínio; o dono (1), tudo
await q(`select lancar_rodada(1)`);
const rodada = await q(`select clube_id, tipo, valor from lancamentos where rodada = 1 order by clube_id, tipo`);
assert.deepEqual(rodada.map(r => [r.clube_id, r.tipo, r.valor]), [[1, "patrocinio", 80], [1, "tv", 100], [2, "patrocinio", 40], [2, "tv", 50]]);
assert.equal((await q(`select caixa from financas where clube_id = 2`))[0].caixa, 22090);
console.log("valores do reinício (SQL): ok");
