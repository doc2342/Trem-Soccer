// Confere o supabase/130_lances_somam_na_folha.sql num Postgres em memória (PGlite): o lance soma a folha dos outros leilões em que
// o clube está na frente, e o fechamento grava no histórico o motivo do lance descartado. Uso: node ferramentas/teste_lances_na_folha.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.uid() returns uuid language sql as $$ select current_setting('teste.uid', true)::uuid $$;
create table ligas (id bigint primary key, temporada int, horas_leilao numeric);
create table clubes (id bigint primary key, liga_id bigint, dono uuid);
create table financas (clube_id bigint, caixa int);
create table jogadores (id bigint primary key, nome text, idade int, clube_id bigint, salario int, salario_mercado int, livre_liga bigint,
  livre_ate timestamptz, livre_inicio timestamptz, livre_abriu bigint, oferta_liga_ate timestamptz);
create table ofertas_livres (id serial primary key, jogador_id bigint, clube_id bigint, salario int, temporadas int, criada_em timestamptz default now(), unique (jogador_id, clube_id));
create table transferencias (jogador_id bigint, criada_em timestamptz default now());
create table historico_lances (jogador_id bigint, clube_id bigint, salario int, temporadas int, criada_em timestamptz not null default clock_timestamp(), primary key (jogador_id, clube_id, criada_em));
create function teto_do_clube(bigint) returns int language sql as $$ select 20000 $$;
create function folha_do_clube(bigint) returns int language sql as $$ select coalesce(sum(salario), 0)::int from jogadores where clube_id = $1 $$;
create function impedimento_de_contrato(c bigint, s int) returns text language sql as $$
  select case when folha_do_clube(c) + s > teto_do_clube(c) then 'a folha passaria do teto' end $$;
create function vaga_no_elenco(bigint, int) returns text language sql as $$ select null::text $$;
create function vaga_de_estrangeiro(bigint, bigint) returns text language sql as $$ select null::text $$;
create function fim_do_leilao(t timestamptz, h numeric) returns timestamptz language sql as $$ select t + make_interval(secs => (h * 3600)::int) $$;
create function contratar_livre(p_j bigint, p_c bigint, p_s int, p_t int) returns void language sql as $$
  update jogadores set clube_id = p_c, salario = p_s where id = p_j; insert into transferencias values (p_j) $$;
create function venda_automatica(bigint, text) returns void language sql as $$ select $$;
insert into ligas values (1, 14, 4.73);
insert into clubes values (45, 1, '00000000-0000-0000-0000-000000000045'), (46, 1, '00000000-0000-0000-0000-000000000046');
-- folha de 16.114 mil, como a do bnetto antes do FC; três livres
insert into jogadores (id, nome, idade, clube_id, salario) values (1, 'elenco', 25, 45, 16114);
insert into jogadores (id, nome, idade, salario_mercado, livre_liga) values (1380, 'FC', 25, 1860, 1), (2909, 'DC1', 25, 1755, 1), (1368, 'DC2', 25, 1980, 1);
`);
await db.exec(fs.readFileSync(new URL("../supabase/88_historico_de_lances.sql", import.meta.url), "utf8").replace(/^insert into historico_lances[\s\S]*$/m, ""));
await db.exec(fs.readFileSync(new URL("../supabase/130_lances_somam_na_folha.sql", import.meta.url), "utf8"));
const lance = (j, s) => q(`select dar_lance_livre($1, $2, 2) r`, [j, s]);
await q(`select set_config('teste.uid', '00000000-0000-0000-0000-000000000045', false)`);

// cada lance cabe sozinho, mas 16.114 + 2.046 + 1.931 passa de 20.000: ao lado do FC só cabe um DC de 1.755
await lance(1380, 2046);
await assert.rejects(lance(2909, 1931), /outros leilões \(2046 mil\)/);
assert.match((await lance(2909, 1755))[0].r, /Lance registrado/);
await assert.rejects(lance(1368, 1980), /passariam do teto/);
// cobrir o próprio lance não conta o próprio leilão duas vezes
assert.match((await lance(1380, 2100))[0].r, /Lance registrado/);
// coberto por outro clube, o leilão deixa de contar e o lance seguinte cabe
await q(`select set_config('teste.uid', '00000000-0000-0000-0000-000000000046', false)`);
await lance(1380, 2200);
await q(`select set_config('teste.uid', '00000000-0000-0000-0000-000000000045', false)`);
assert.strictEqual((await q(`select folha_em_leiloes(45) n`))[0].n, 1755);
console.log("lance: ok");

// fechamento: lance antigo (de antes do 130) que estoura o teto é descartado com o motivo; o outro clube leva o FC
await q(`insert into jogadores (id, nome, idade, clube_id, salario) values (2, 'renovação', 25, 45, 2200)`); // a folha subiu depois do lance
await q(`update jogadores set livre_ate = now() - interval '1 minute', livre_inicio = now() - interval '5 hours' where id in (1380, 2909)`);
await q(`select resolver_leiloes(1)`);
assert.deepStrictEqual(await q(`select clube_id::int from jogadores where id = 1380`), [{ clube_id: 46 }]);
assert.deepStrictEqual(await q(`select clube_id from jogadores where id = 2909`), [{ clube_id: null }]);
assert.deepStrictEqual(await q(`select jogador_id::int, descartado from historico_lances where clube_id = 45 order by jogador_id`),
  [{ jogador_id: 1380, descartado: null }, { jogador_id: 2909, descartado: "a folha passaria do teto" }]); // no FC ele só perdeu
// novo lance no mesmo jogador abre registro novo no histórico (o descartado fica)
await q(`delete from jogadores where id = 2`);
await lance(2909, 1755);
assert.deepStrictEqual(await q(`select descartado from historico_lances where clube_id = 45 and jogador_id = 2909 order by criada_em`),
  [{ descartado: "a folha passaria do teto" }, { descartado: null }]);
console.log("fechamento: ok");
