// Confere o fechamento da temporada: as contas de src/rodada.js (tabela final, mérito da Série C, técnico do ano), o
// 145_fechamento_da_temporada.sql e o aviso ao agendamento (146_fechamento_no_cron.sql) num Postgres em memória (PGlite, se instalado). Uso: node ferramentas/teste_fechamento_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
const { classificacaoFinal, meritoDaSerieC, tecnicosDoAno } = await import(new URL("../src/rodada.js", import.meta.url));

// grupo D (Série B3) de 4: 1 vence todos, 2 vence 3 e 4, 3 vence 4; clube guardado (X) fica de fora
const clubes = [1, 2, 3, 4].map(id => ({ id, nome: "C" + id, grupo: "D", divisao: 2 })).concat({ id: 9, nome: "G", grupo: "X", divisao: 2 });
const partidas = [], resultados = [];
for (const [a, b] of [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]) { partidas.push({ id: partidas.length + 1, grupo: "D", fase: "liga", casa: a, fora: b }); resultados.push({ partida_id: partidas.length, gols_casa: 1, gols_fora: 0 }); }
const linhas = classificacaoFinal(clubes, partidas, resultados);
assert.deepStrictEqual(linhas.map(l => [l.clube_id, l.posicao, l.pontos, l.premio]), [[1, 1, 9, 3000], [2, 2, 6, 2400], [3, 3, 3, 1800], [4, 4, 0, 1200]]);
// sem Série C não há mérito
assert.deepStrictEqual(meritoDaSerieC(linhas, [1, 3]), []);
// técnico do ano: o 4 tem o elenco mais forte e o 1 o mais fraco; o 1 superou a colocação esperada (4º) em três
const elenco = n => Array.from({ length: 11 }, () => ({ pos: "MC", at: Array(30).fill(n) }));
assert.deepStrictEqual(tecnicosDoAno(linhas, { 1: elenco(5), 2: elenco(8), 3: elenco(10), 4: elenco(15) }), [{ grupo: "D", clube_id: 1, numero: 3 }]);
console.log("contas: ok");

// o fechamento roda pela API, onde o Supabase barra delete sem where ("DELETE requires a WHERE clause"); o PGlite não tem essa trava
for (const f of ["144_selecao_em_formacao.sql", "145_fechamento_da_temporada.sql", "147_selecao_pela_api.sql"])
  assert.doesNotMatch(fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8"), /delete from [\w.]+\s*;/i, f + ": delete sem where");

// ---------- SQL: fechar_temporada e a virada, com tabelas mínimas ----------
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.role() returns text language sql as $$ select nullif(current_setting('teste.role', true), '') $$;
create function public.eh_admin() returns boolean language sql as $$ select coalesce(current_setting('teste.admin', true), '') = '1' $$;
create table ligas (id bigint primary key, temporada int, copa jsonb, fundo_taca int default 0, pausada boolean default false, bots_mercado text);
create table clubes (id bigint primary key, liga_id bigint, grupo text, divisao int, dono uuid, dirigente text, premio_antecipado int default 0, paraquedas int, carne int default 0, torcida int default 1000);
create table partidas (id serial primary key, liga_id bigint, grupo text, rodada int, fase text, copa_fase int, casa bigint, fora bigint, inicio timestamptz, fim timestamptz, processada boolean default true, vencedor bigint);
create table resultados (partida_id int, gols_casa int, gols_fora int, relatorio jsonb default '{}', efeitos jsonb, libera_em timestamptz default now());
create table financas (clube_id bigint primary key, caixa int default 0);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create table historico (liga_id bigint, temporada int, clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int,
  gols_pro int, gols_contra int, premio int, destino text, copa text, supercopa boolean, lib text, sul text, recopa boolean, primary key (liga_id, temporada, clube_id));
create table premios_individuais (liga_id bigint, temporada int, comp text, premio text, jogador_id text, jogador text, pos text, clube_id bigint, valor int, numero numeric, unique (liga_id, temporada, comp, premio));
create table base_jogos (liga_id bigint, temporada int, grupo text, fase text, inicio timestamptz, casa bigint, fora bigint, gols_casa int, gols_fora int, processada boolean);
create table base_campeoes (liga_id bigint, temporada int, grupo text, clube_id bigint);
create table patrocinios (liga_id bigint, temporada int, clube_id bigint, meta int, bonus int, travado boolean, bonus_pago int);
create table jogadores (id serial primary key, clube_id bigint, idade int, at smallint[], salario int, salario_mercado int, contrato_ate int, amarelos int, fora_jogos int, fora_motivo text, juvenil boolean);
create table divisoes (liga_id bigint, divisao int, torcida_base int);
create function copa_campanhas(bigint) returns jsonb language sql as $$ select '{"2": "campeão"}'::jsonb $$;
create function guardar_estatisticas(bigint) returns int language sql as $$ select 0 $$;
create function premiar_temporada(bigint, jsonb) returns text language sql as $$ update financas f set caixa = caixa + (select sum((x->>'valor')::int) from jsonb_array_elements($2) x where (x->>'clube_id')::bigint = f.clube_id)
  where f.clube_id in (select (x->>'clube_id')::bigint from jsonb_array_elements($2) x); select 'fundo.' $$;
create function vaga_da_selecao(text) returns text language sql as $$ select $1 $$;
create function imposto_do_lucro(int, int) returns int language sql as $$ select 0 $$;
create function teto_do_clube(bigint) returns int language sql as $$ select 0 $$;
create function janela_do_mercado(bigint) returns text language sql as $$ select null::text $$;
create function listados_para_os_bots(bigint) returns setof int language sql as $$ select 1 where false $$;
insert into ligas values (1, 1, '{"sem_playoffs": true}'), (2, 1, '{"sem_playoffs": true}');
insert into clubes (id, liga_id, grupo, divisao) select g, case when g <= 4 then 1 else 2 end, 'D', 2 from generate_series(1, 8) g;
insert into financas (clube_id) select g from generate_series(1, 8) g;
insert into patrocinios values (1, 1, 1, 2, 300, true, null), (1, 1, 4, 2, 300, true, null);
insert into partidas (liga_id, grupo, rodada, fase, casa, fora, fim) values (1, 'D', 1, 'liga', 1, 2, now() + interval '1 hour'), (2, 'D', 1, 'liga', 5, 6, now() - interval '2 hours'),
  (1, 'D', 9, 'final', 1, 2, now() - interval '3 hours'), (2, 'D', 9, 'final', 5, 6, now() - interval '3 hours'); -- com a final criada, o aviso dos playoffs (67) fica quieto
insert into resultados (partida_id, gols_casa, gols_fora) values (1, 1, 0), (2, 1, 0);
`);
const sql = fs.readFileSync(new URL("../supabase/145_fechamento_da_temporada.sql", import.meta.url), "utf8").replace(/^notify .*$/m, "");
await db.exec(sql); await db.exec(sql); // pode rodar duas vezes
const cron = fs.readFileSync(new URL("../supabase/146_fechamento_no_cron.sql", import.meta.url), "utf8");
await db.exec(cron); await db.exec(cron);
const temTrabalho = async () => (await q(`select tarefas_do_minuto() t`))[0].t;
const caixa = async id => (await q(`select caixa from financas where clube_id = $1`, [id]))[0].caixa;
const fechar = (liga, temporada = 1) => q(`select fechar_temporada($1, $2, $3::jsonb, $4::jsonb, $5::jsonb) r`,
  [liga, temporada, JSON.stringify(linhas), JSON.stringify(meritoDaSerieC(linhas, [3])), JSON.stringify(tecnicosDoAno(linhas, {}))]).then(r => r[0].r);

// agendamento: a liga 2 acabou há duas horas e não foi fechada → chama a função; a liga 1 ainda está em jogo
assert.strictEqual(await temTrabalho(), true);
await q(`update ligas set temporada_fechada = 1 where id = 2`);
assert.strictEqual(await temTrabalho(), false);
await q(`update ligas set temporada_fechada = null where id = 2`);
// sem ser servidor nem administrador: barrado
await assert.rejects(fechar(1), /Sem permissão/);
await q(`select set_config('teste.role', 'service_role', false)`);
// liga 1: o último jogo ainda não acabou → nada
assert.strictEqual(await fechar(1), "");
assert.strictEqual((await q(`select count(*)::int n from historico`))[0].n, 0);
// acabou: tabela no histórico, prêmio, copa, mérito, técnico e patrocínio (o 1 terminou em 1º, meta 2º: recebe; o 4 não)
await q(`update partidas set fim = now() - interval '2 hours' where liga_id = 1`);
// efeito do apito final ainda por gravar → espera
await q(`update resultados set efeitos = '{}' where partida_id = 1`);
assert.strictEqual(await fechar(1), "");
await q(`update resultados set efeitos = null`);
assert.match(await fechar(1), /Temporada 1 fechada: 8400 mil/);
assert.deepStrictEqual((await q(`select clube_id, posicao, premio, destino, copa from historico where liga_id = 1 order by clube_id`)).map(r => [r.clube_id, r.posicao, r.premio, r.destino, r.copa]),
  [[1, 1, 3000, null, null], [2, 2, 2400, null, "campeão"], [3, 3, 1800, null, null], [4, 4, 1200, null, null]]);
assert.strictEqual(await caixa(1), 3000 + 300);
assert.strictEqual(await caixa(3), 1800);
assert.strictEqual(await caixa(4), 1200);
assert.strictEqual((await q(`select count(*)::int n from premios_individuais where premio = 'tecnico'`))[0].n, 1);
assert.strictEqual((await q(`select temporada_fechada t from ligas where id = 1`))[0].t, 1);
// de novo: não paga duas vezes
assert.strictEqual(await fechar(1), "");
assert.strictEqual(await caixa(1), 3300);
// temporada errada: nada
assert.strictEqual(await fechar(2, 7), "");

// virada da liga 1 (fechada): só o destino; o prêmio antecipado ainda é descontado
await q(`select set_config('teste.role', '', false)`); await q(`select set_config('teste.admin', '1', false)`);
await q(`update clubes set premio_antecipado = 600 where id = 4`);
const destinos = { 1: "subiu", 2: "ficou", 3: "subiu", 4: "ficou" };
const virar = (liga, desloca) => q(`select virar_temporada($1, $2::jsonb) r`, [liga, JSON.stringify({ temporada: 1, classificacao: linhas.map(l => ({ ...l, clube_id: l.clube_id + desloca, destino: destinos[l.clube_id] })) })]).then(r => r[0].r);
assert.match(await virar(1, 0), /8400 mil em prêmios/);
assert.strictEqual(await caixa(1), 3300);
assert.strictEqual(await caixa(4), 1200 - 600);
assert.deepStrictEqual((await q(`select destino from historico where liga_id = 1 order by clube_id`)).map(r => r.destino), ["subiu", "ficou", "subiu", "ficou"]);
// virada da liga 2 sem fechamento: grava a tabela e paga o prêmio, como antes
assert.match(await virar(2, 4), /8400 mil em prêmios/);
assert.strictEqual(await caixa(5), 3000);
assert.strictEqual((await q(`select count(*)::int n from historico where liga_id = 2`))[0].n, 4);
console.log("SQL: ok");
