// Confere o supabase/171_vitrine_compra_listados.sql num Postgres em memória (PGlite): a vitrine compra o listado que os bots já olharam,
// pelo preço pedido, até 2,5× o salário de mercado, 2 por clube por temporada, com o fundo acima da reserva; o jogador vai à vitrine com
// lance mínimo de 3× o mercado; o arquivo roda duas vezes. Uso: node ferramentas/teste_vitrine_listados_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const sql = fs.readFileSync(new URL("../supabase/171_vitrine_compra_listados.sql", import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create schema auth; create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
create function eh_admin() returns boolean language sql as $$ select false $$;
create table ligas (id bigint primary key, temporada int, pausada boolean, fundo_taca int);
create table clubes (id bigint primary key, liga_id bigint, dono uuid);
create table jogadores (id bigint primary key, clube_id bigint, nome text, pos text, salario int, salario_mercado int, juvenil boolean, emprestado_de bigint,
  a_venda boolean, preco_pedido int, listado_em timestamptz, bots_viram text, vitrine_minimo int, vitrine_dono uuid, livre_ate timestamptz, livre_inicio timestamptz,
  contrato_ate int, protegido boolean, protegido_ate int, principal boolean, treino text);
create table propostas (jogador_id bigint, estado text);
create table transferencias (id serial primary key, liga_id bigint, temporada int, janela text, tipo text, jogador_id bigint, jogador text, pos text, de_clube bigint, para_clube bigint, valor int);
create table partidas (casa bigint, fora bigint, processada boolean, fim timestamptz);
create table financas (clube_id bigint primary key, caixa int);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create function janela_do_mercado(p bigint) returns text language sql as $$ select 'inicio'::text $$;
create function vitrine_da_liga(p bigint) returns bigint language sql as $$ select 99::bigint $$;
create function pagar_pelo_fundo(p_liga bigint, p_valor int) returns int language plpgsql as $$
declare v int; begin select least(p_valor, fundo_taca) into v from ligas where id = p_liga; update ligas set fundo_taca = fundo_taca - v where id = p_liga; return v; end $$;
insert into ligas values (1, 0, false, 27000);
insert into clubes values (1, 1, gen_random_uuid()), (2, 1, gen_random_uuid()), (99, 1, null);
insert into financas values (1, 1000), (2, 1000);
-- elencos de 20 (o vendedor fica com 16 ou mais)
insert into jogadores (id, clube_id, nome, pos, salario, salario_mercado) select 100 + g, 1, 'Reserva ' || g, 'MC', 100, 100 from generate_series(1, 20) g;
insert into jogadores (id, clube_id, nome, pos, salario, salario_mercado) select 200 + g, 2, 'Reserva ' || g, 'MC', 100, 100 from generate_series(1, 20) g;
update jogadores set a_venda = true, listado_em = now() - interval '2 days', bots_viram = '0:inicio', salario_mercado = 400 where id in (101, 102, 103, 104, 105, 201);
update jogadores set preco_pedido = 1000 where id in (101, 102, 103); -- 2,5× de 400: cabe (o 3º passa do limite de 2 por temporada)
update jogadores set preco_pedido = 1001 where id = 104;               -- acima de 2,5×
update jogadores set preco_pedido = 900, bots_viram = null where id = 105; -- os bots ainda não olharam
update jogadores set preco_pedido = 1000, listado_em = now() - interval '1 day' where id = 201; -- cabe, mas o fundo chega à reserva
`);
await db.exec(sql); await db.exec(sql); // roda duas vezes
assert.equal((await q(`select vitrine_compra_listados(1) n`))[0].n, 2);
assert.deepEqual(await q(`select id, clube_id, a_venda, vitrine_minimo, salario from jogadores where id in (101, 102, 103, 104, 105, 201) order by id`), [
  { id: 101, clube_id: 99, a_venda: false, vitrine_minimo: 1200, salario: 400 }, { id: 102, clube_id: 99, a_venda: false, vitrine_minimo: 1200, salario: 400 },
  { id: 103, clube_id: 1, a_venda: true, vitrine_minimo: null, salario: 100 }, { id: 104, clube_id: 1, a_venda: true, vitrine_minimo: null, salario: 100 },
  { id: 105, clube_id: 1, a_venda: true, vitrine_minimo: null, salario: 100 }, { id: 201, clube_id: 2, a_venda: true, vitrine_minimo: null, salario: 100 }]);
assert.deepEqual(await q(`select (select caixa from financas where clube_id = 1) caixa, (select fundo_taca from ligas) fundo, (select count(*)::int from transferencias where tipo = 'vitrine_lista') n`),
  [{ caixa: 3000, fundo: 25000, n: 2 }]); // o 201 ficaria abaixo da reserva de 25.000
console.log("teste_vitrine_listados_sql: ok");
