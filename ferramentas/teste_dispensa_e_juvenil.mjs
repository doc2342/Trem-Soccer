// Confere o supabase/133_dispensa_com_multa_e_venda_de_juvenil.sql num Postgres em memória (PGlite): multa da dispensa de 22 a 30 anos,
// venda negociada de juvenil a partir dos 18 e parte do formador pelas temporadas de formação. Uso: node ferramentas/teste_dispensa_e_juvenil.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql as $$ select current_setting('teste.uid', true)::uuid $$;
create table ligas (id bigint primary key, temporada int, rodadas_por_temporada int default 18);
create table clubes (id bigint primary key, liga_id bigint, dono uuid, nome text, divisao int default 1);
create table financas (clube_id bigint, caixa int);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create table partidas (id bigint, casa bigint, fora bigint, processada boolean, fim timestamptz, liga_id bigint, fase text);
create table resultados (partida_id bigint, relatorio jsonb);
create table safras (clube_id bigint, temporada int, jogador text);
create table propostas (id bigint primary key, liga_id bigint, jogador_id bigint, comprador bigint, vendedor bigint, valor int, salario int, temporadas int,
  estado text, atualizada_em timestamptz);
create table transferencias (liga_id bigint, temporada int, janela text, tipo text, jogador_id bigint, jogador text, pos text, de_clube bigint, para_clube bigint,
  valor int, taxa int, salario_antes int, contrato_antes int, protegido_ate_antes int, formador_clube bigint, formador_valor int);
create table jogadores (id bigint primary key, nome text, pos text, idade int, clube_id bigint, salario int, salario_mercado int, contrato_ate int,
  juvenil boolean, formador bigint, emprestado_de bigint, a_venda boolean, protegido boolean, protegido_ate int, pre_contrato int, principal boolean,
  chegou_temporada int, chegou_janela text, treino jsonb, livre_liga bigint, livre_ate timestamptz, livre_inicio timestamptz, livre_abriu bigint,
  dispensado_por bigint, dispensado_temporada int);
create function janela_do_mercado(bigint) returns text language sql as $$ select current_setting('teste.janela', true) $$;
create function periodo_de_pre_acordo(bigint) returns boolean language sql as $$ select false $$;
create function indice_da_janela(int, text) returns int language sql as $$ select $1 * 2 + case when $2 = 'meio' then 1 else 0 end $$;
create function teto_do_clube(bigint) returns int language sql as $$ select 100000 $$;
create function folha_do_clube(bigint) returns int language sql as $$ select coalesce(sum(salario), 0)::int from jogadores where clube_id = $1 $$;
create function taxa_da_venda(bigint) returns numeric language sql as $$ select 0.1 $$;
insert into ligas values (1, 14);
insert into clubes (id, liga_id, dono, nome) values (10, 1, '00000000-0000-0000-0000-000000000010', 'A'), (20, 1, '00000000-0000-0000-0000-000000000020', 'B'),
  (30, 1, '00000000-0000-0000-0000-000000000030', 'C');
insert into financas values (10, 5000), (20, 50000), (30, 50000);
insert into jogadores (id, nome, idade, clube_id, salario) select g, 'x' || g, 25, 10, 10 from generate_series(100, 120) g; -- elenco acima de 16
insert into jogadores (id, nome, idade, clube_id, salario) select g, 'y' || g, 25, 20, 10 from generate_series(200, 220) g;
insert into jogadores (id, nome, idade, clube_id, salario, contrato_ate) values (1, 'meia de 25', 25, 10, 1000, 15), (2, 'garoto de 21', 21, 10, 1000, 15);
insert into lancamentos (clube_id, temporada, tipo, valor) select 10, 14, 'salarios', -1 from generate_series(1, 9);
`);
await db.exec(fs.readFileSync(new URL("../supabase/133_dispensa_com_multa_e_venda_de_juvenil.sql", import.meta.url), "utf8"));
await db.exec(`create trigger guardas_da_base before update on jogadores for each row execute function guardas_da_base();
  create trigger repassar_ao_formador before insert on transferencias for each row execute function repassar_ao_formador();`);
const como = c => q(`select set_config('teste.uid', '00000000-0000-0000-0000-0000000000${c}', false)`);
const caixa = async c => (await q(`select caixa from financas where clube_id = $1`, [c]))[0].caixa;

// 1. dispensa: 25 anos, contrato até a T15, 9 de 18 rodadas pagas na T14 → 50% × 1000 × 1,5 = 750; 21 anos sai grátis
await como(10);
assert.strictEqual((await q(`select multa_da_dispensa(1) m`))[0].m, 750);
assert.match((await q(`select dispensar_jogador(1) r`))[0].r, /rescisão de 750 mil/);
assert.strictEqual(await caixa(10), 4250);
assert.strictEqual((await q(`select multa_da_dispensa(2) m`))[0].m, 0);
await q(`select dispensar_jogador(2)`);
assert.strictEqual(await caixa(10), 4250);
await q(`insert into jogadores (id, nome, idade, clube_id, salario, contrato_ate) values (3, 'caro', 28, 10, 10000, 16)`);
await assert.rejects(q(`select dispensar_jogador(3)`), /Caixa insuficiente/);
console.log("dispensa: ok");

// 2. juvenil: formado no A desde a T11 (chega pelo insert fora da virada → T14; corrigido à mão para a T11)
await q(`insert into jogadores (id, nome, idade, clube_id, salario_mercado, juvenil, formador) values (5, 'juvenil 17', 17, 10, 100, true, 10), (6, 'juvenil 18', 18, 10, 100, true, 10)`);
assert.strictEqual((await q(`select formado_desde from jogadores where id = 5`))[0].formado_desde, 14);
await q(`update jogadores set formado_desde = 11 where id = 6`);
await q(`select set_config('teste.janela', 'inicio', false)`);
assert.match((await q(`select trava_da_negociacao(5, 20, 300) t`))[0].t, /a partir dos 18/);
assert.match((await q(`select trava_da_negociacao(6, 20, 200) t`))[0].t, /mínimo é de 300/);
assert.strictEqual((await q(`select trava_da_negociacao(6, 20, 500) t`))[0].t, null);
await assert.rejects(q(`update jogadores set clube_id = 20 where id = 5`), /só muda de clube por venda negociada/);
await q(`insert into propostas values (1, 1, 6, 20, 10, 500, 150, 2, 'pendente')`);
await q(`select fechar_negocio(1, 500)`);
assert.deepStrictEqual(await q(`select clube_id::int, juvenil, salario, contrato_ate, formado_ate from jogadores where id = 6`),
  [{ clube_id: 20, juvenil: false, salario: 150, contrato_ate: 16, formado_ate: 14 }]);
assert.strictEqual((await q(`select count(*)::int n from lancamentos where tipo = 'formador'`))[0].n, 0); // o próprio formador vendeu
await q(`select set_config('teste.janela', '', false)`);
assert.match((await q(`select trava_da_negociacao(5, 20, 300) t`))[0].t, /a partir dos 18/);
console.log("juvenil: ok");

// 3. formador: T11 a T14 = 3 temporadas → 9%; B revende a C por 1000 na T16 (não conta mais: já saiu do A)
await q(`update ligas set temporada = 16`);
assert.strictEqual(+(await q(`select parte_do_formador(6) p`))[0].p, 0.09);
await q(`insert into transferencias (liga_id, temporada, jogador_id, jogador, de_clube, para_clube, valor) values (1, 16, 6, 'juvenil 18', 20, 30, 1000)`);
assert.deepStrictEqual(await q(`select clube_id::int, valor, descricao from lancamentos where tipo = 'formador' order by clube_id`),
  [{ clube_id: 10, valor: 90, descricao: "Clube formador: 9% da venda de juvenil 18" }, { clube_id: 20, valor: -90, descricao: "Repasse de 9% ao clube formador: juvenil 18" }]);
// teto de 15% e mínimo de 3%
await q(`update jogadores set formado_desde = 2 where id = 6`);
assert.strictEqual(+(await q(`select parte_do_formador(6) p`))[0].p, 0.15);
await q(`update jogadores set formado_desde = 14 where id = 6`);
assert.strictEqual(+(await q(`select parte_do_formador(6) p`))[0].p, 0.03);
// na virada (trem.virada = 1) o jovem conta a partir da temporada seguinte
await q(`select set_config('trem.virada', '1', false)`);
await q(`insert into jogadores (id, nome, idade, clube_id, juvenil, formador) values (7, 'da virada', 16, 10, true, 10)`);
assert.strictEqual((await q(`select formado_desde from jogadores where id = 7`))[0].formado_desde, 17);
console.log("formador: ok");
