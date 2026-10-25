// Confere o supabase/149_reinicio_da_liga.sql num Postgres em memória (PGlite): reiniciar_liga apaga o estado da liga, grava grupos e elencos,
// preserva a identidade dos clubes, é repetível, só admin roda e o arquivo é idempotente. Uso: node ferramentas/teste_reinicio_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const sql = fs.readFileSync(new URL("../supabase/149_reinicio_da_liga.sql", import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
set check_function_bodies = off;
create role anon; create role authenticated;
create table admins (n int); create function eh_admin() returns boolean language sql as $$ select not exists (select 1 from admins) $$;
create function pais_do_grupo(g text) returns text language sql immutable as $$ select case g when 'ARG' then 'Argentina' else 'Brasil' end $$;
create table ligas (id bigint primary key, temporada int, pausada boolean, pausada_em timestamptz, fundo_taca int, temporada_fechada int, aposentadorias_em int,
  janela_inicio_fecha timestamptz, janela_meio_abre timestamptz, janela_meio_fecha timestamptz, copa jsonb, sedes jsonb);
create table clubes (id bigint primary key, liga_id bigint, grupo text, dono uuid, nome text, escudo text, divisao int, estadio_nivel int, humor numeric, ct_nivel int, medico_nivel int, fisio_nivel int, base_nivel int,
  estadio_visual jsonb, paraquedas int, carne int, carne_temporada int, vermelho_rodadas int, premio_antecipado int, antecipou_temporada int, confianca int, segundo_clube boolean, multas_extra int,
  multas_extra_temporada int, candidatos_em timestamptz, peneira_temporada int, escudo_troca boolean, torcida_fator numeric, torcida_fator_temporada int, socios_auto boolean, torcida int);
create table divisoes (liga_id bigint, divisao int, torcida_base int);
create table financas (clube_id bigint primary key, caixa int);
create table jogadores (id bigserial primary key, clube_id bigint, livre_liga bigint, nome text, pais text, idade smallint, pos text, fam jsonb, at smallint[], pe text, principal boolean,
  salario int, salario_mercado int, contrato_ate int, protegido_ate int);
create table jogadores_ocultos (jogador_id bigint references jogadores on delete cascade, tal smallint);
create table partidas (id serial primary key, liga_id bigint); create table historico (liga_id bigint); create table transferencias (liga_id bigint);
create table lancamentos (clube_id bigint); create table treinadores (clube_id bigint);
create table estado_inicial (liga_id bigint);
create function reiniciar_teste(p_liga bigint, p_sortear boolean) returns text language sql as $$ select ''::text $$;
create function guardar_estado_inicial(p_liga bigint) returns int language sql as $$ select 0 $$;
insert into ligas values (1, 14, true, now(), 900, 14, 14, now(), now(), now(), '{"x":1}', '{"y":1}');
insert into divisoes values (1, 1, 30000), (1, 2, 12000), (1, 3, 5000);
insert into clubes (id, liga_id, grupo, dono, nome, escudo, divisao, ct_nivel, confianca, torcida) values
  (1, 1, 'A', '00000000-0000-0000-0000-000000000001', 'Dono FC', 'escudo-do-dono', 1, 4, 80, 99999), (2, 1, 'F', null, 'Bot FC', null, 3, 2, 20, 1), (3, 1, 'ARG', null, 'Argentino', null, 1, 0, 50, 1);
insert into financas values (1, 777), (2, -5);
insert into jogadores (clube_id, nome) values (1, 'velho'), (2, 'velho2'); insert into jogadores (livre_liga, nome) values (1, 'livre');
insert into jogadores_ocultos select id, 70 from jogadores;
insert into partidas (liga_id) values (1), (1); insert into historico values (1); insert into transferencias values (1); insert into lancamentos values (1); insert into treinadores values (2);
`);
await db.exec(sql);
const grupos = { 1: "B", 2: "A", 3: "ARG" };
const j = (clube_id, nome) => ({ clube_id, nome, idade: 25, pos: "MC", fam: { MC: 1 }, at: [10, 11, 12], pe: "D", principal: true, tal: 80, salario: 100, salario_mercado: 120, contrato_ate: 1, protegido_ate: 0 });
const lista = [j(1, "novo1"), j(1, "novo2"), j(2, "novo3")];
const estado = async () => ({
  c: await q(`select id, grupo, divisao, nome, escudo, dono is not null dono, ct_nivel, confianca, torcida from clubes order by id`),
  l: (await q(`select temporada, pausada, fundo_taca, temporada_fechada, copa, sedes from ligas`))[0],
  f: await q(`select clube_id, caixa from financas order by 1`),
  j: await q(`select clube_id, nome, (select tal from jogadores_ocultos o where o.jogador_id = jogadores.id) tal from jogadores order by id`),
  v: (await q(`select (select count(*)::int from partidas) p, (select count(*)::int from historico) h, (select count(*)::int from transferencias) t, (select count(*)::int from lancamentos) l, (select count(*)::int from treinadores) tr`))[0],
  d: (await q(`select count(*)::int n from divisoes where divisao = 3`))[0].n,
});
assert.equal((await q(`select reiniciar_liga(1, $1::jsonb, $2::jsonb) r`, [JSON.stringify(grupos), JSON.stringify(lista)]))[0].r, "Liga reiniciada na temporada 0: 3 jogadores novos.");
const e = await estado();
assert.deepEqual(e.v, { p: 0, h: 0, t: 0, l: 0, tr: 0 });                       // (a) estado de jogo vazio
assert.deepEqual(e.c.map(c => [c.id, c.grupo, c.divisao]), [[1, "B", 2], [2, "A", 1], [3, "ARG", 1]]);
assert.deepEqual(e.l, { temporada: 0, pausada: false, fundo_taca: 0, temporada_fechada: null, copa: null, sedes: null });
assert.deepEqual(e.f, [{ clube_id: 1, caixa: 5000 }, { clube_id: 2, caixa: 5000 }, { clube_id: 3, caixa: 5000 }]);
assert.deepEqual(e.c.map(c => [c.torcida, c.ct_nivel, c.confianca]), [[12000, 0, 50], [30000, 0, 50], [30000, 0, 50]]);
assert.deepEqual(e.j, [{ clube_id: 1, nome: "novo1", tal: 80 }, { clube_id: 1, nome: "novo2", tal: 80 }, { clube_id: 2, nome: "novo3", tal: 80 }]); // sem os velhos nem os livres
assert.equal(e.d, 0);                                                              // sem divisão 3
assert.deepEqual(e.c[0], { id: 1, grupo: "B", divisao: 2, nome: "Dono FC", escudo: "escudo-do-dono", dono: true, ct_nivel: 0, confianca: 50, torcida: 12000 }); // (b) identidade e dono
// (c) repetir dá o mesmo resultado, sem duplicar
await q(`select reiniciar_liga(1, $1::jsonb, $2::jsonb)`, [JSON.stringify(grupos), JSON.stringify(lista)]);
assert.deepEqual(await estado(), e);
assert.equal((await q(`select count(*)::int n from jogadores_ocultos`))[0].n, 3);
// (e) o arquivo roda duas vezes; o que ele derruba sai de verdade
await db.exec(sql);
assert.equal((await q(`select count(*)::int n from pg_proc where proname in ('reiniciar_teste', 'guardar_estado_inicial')`))[0].n, 0);
assert.equal((await q(`select to_regclass('estado_inicial') r`))[0].r, null);
assert.deepEqual((await q(`select divisao_do_grupo('A') a, divisao_do_grupo('ARG') p, divisao_do_grupo('D') d, divisao_do_grupo('X') x, divisao_do_grupo('E') e`))[0], { a: 1, p: 1, d: 2, x: 2, e: 2 });
// (d) não-admin recebe erro
await q(`insert into admins values (1)`);
await assert.rejects(q(`select reiniciar_liga(1, '{}', '[]')`), /Só o administrador/);
console.log("teste_reinicio_sql: ok");
