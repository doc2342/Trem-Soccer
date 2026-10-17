// Confere as vagas da Libertadores e da Sul-Americana (vagasContinentais em src/virada.js) e o 112_sulamericana_e_recopa.sql num
// Postgres em memória (PGlite, se instalado). Uso: node ferramentas/teste_sulamericana.mjs
import assert from "node:assert";
import fs from "node:fs";
const { vagasContinentais } = await import(new URL("../src/virada.js", import.meta.url));

// Série A de 12 (ids 1..12 pela posição) e 4 países de 10 (ids 101.., 201.., 301.., 401..)
const campanhas = [...Array.from({ length: 12 }, (_, k) => ({ clube_id: k + 1, grupo: "A", posicao: k + 1 })),
  ...["ARG", "URU", "COL", "CHI"].flatMap((g, p) => Array.from({ length: 10 }, (_, k) => ({ clube_id: 100 * (p + 1) + k + 1, grupo: g, posicao: k + 1 })))];
const v = (c, vi) => { const r = vagasContinentais(campanhas, c, vi); return [r.libBrasil, r.sulBrasil]; };
// normal: campeão da copa da B (50), vice da C (60)
assert.deepStrictEqual(v(50, 60), [[1, 2, 3, 50], [4, 5, 6, 60]]);
// campeão da copa entre os 3: a 4ª da Libertadores é o 4º, e a Sul-Americana desce um (5, 6, 7)
assert.deepStrictEqual(v(2, 60), [[1, 2, 3, 4], [5, 6, 7, 60]]);
// vice da copa já na Libertadores: a vaga dele vai para o próximo da A sem vaga
assert.deepStrictEqual(v(50, 1), [[1, 2, 3, 50], [4, 5, 6, 7]]);
// vice entre o 4º e o 6º: idem
assert.deepStrictEqual(v(50, 5), [[1, 2, 3, 50], [4, 5, 6, 7]]);
// as duas coisas: campeão entre os 3 e vice entre o 5º e o 7º → 5, 6, 7 + 8
assert.deepStrictEqual(v(1, 6), [[1, 2, 3, 4], [5, 6, 7, 8]]);
// vice é o 4º, que foi para a Libertadores (campeão entre os 3)
assert.deepStrictEqual(v(3, 4), [[1, 2, 3, 4], [5, 6, 7, 8]]);
// vice mais abaixo na própria A (9º): entra ele
assert.deepStrictEqual(v(50, 9), [[1, 2, 3, 50], [4, 5, 6, 9]]);
// sem finalistas da copa no histórico
assert.deepStrictEqual(v(null, null), [[1, 2, 3, 4], [5, 6, 7, 8]]);
// países: 1º a 3º na Libertadores, 4º a 6º na Sul-Americana
const r = vagasContinentais(campanhas, 50, 60);
assert.deepStrictEqual(r.libFora.filter(id => id < 200), [101, 102, 103]);
assert.deepStrictEqual(r.sulFora.filter(id => id < 200), [104, 105, 106]);
assert.strictEqual(r.sulFora.length, 12);
// sem histórico (primeira temporada): listas incompletas, o admin não monta
assert.ok(vagasContinentais([], null, null).sulBrasil.length < 4);
console.log("vagas: ok");

// ---------- SQL: continental_avancar e a virada, com tabelas mínimas ----------
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table ligas (id bigint primary key, temporada int, copa jsonb, fundo_taca int default 0, janela_inicio_fecha timestamptz, janela_meio_abre timestamptz, janela_meio_fecha timestamptz);
create table clubes (id bigint primary key, liga_id bigint, estadio_nivel int default 1);
create table partidas (id serial primary key, liga_id bigint, grupo text, rodada int, fase text, copa_fase int, casa bigint, fora bigint, inicio timestamptz, fim timestamptz, processada boolean default false, vencedor bigint, chave int);
create table resultados (partida_id int, gols_casa int, gols_fora int, relatorio jsonb default '{}', efeitos jsonb);
create table financas (clube_id bigint, caixa int default 0);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create table historico (liga_id bigint, temporada int, clube_id bigint, copa text, supercopa boolean, lib text);
create table jogadores (clube_id bigint, livre_liga bigint, amarelos_copa int, fora_copa int, copa_clube bigint);
create function copa_campanhas(bigint) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function devolver_emprestados(bigint) returns void language sql as $$ select $$;
create function virar_temporada(p bigint, j jsonb) returns text language sql as $$ select 'virou' $$;
insert into clubes (id, liga_id) select g, 1 from generate_series(1, 40) g;
insert into financas (clube_id) select g from generate_series(1, 40) g;
insert into historico (liga_id, temporada, clube_id) select 1, 1, g from generate_series(1, 40) g;
`);
await db.exec(fs.readFileSync(new URL("../supabase/112_sulamericana_e_recopa.sql", import.meta.url), "utf8").replace(/^notify .*$/m, ""));
const datas = [1, 2, 3, 4].map(k => ({ inicio: `2020-01-0${k}`, fim: `2020-01-0${k}` }));
await q(`insert into ligas values (1, 1, $1::jsonb)`, [JSON.stringify({ lib: { datas }, sul: { datas }, rec: {} })]);
for (let k = 1; k <= 8; k++) {
  await q(`insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, chave) values (1, 'LIB', 203, 'lib', 3, $1, $2, $3)`, [k, 8 + k, k]);
  await q(`insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, chave) values (1, 'SUL', 303, 'lib', 3, $1, $2, $3)`, [16 + k, 24 + k, k]);
}
await q(`insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora) values (1, 'REC', 406, 'lib', 6, 33, 34)`);
const jogar = async (grupo, fase) => db.exec(`update partidas set processada = true where grupo = '${grupo}' and copa_fase = ${fase};
  insert into resultados (partida_id, gols_casa, gols_fora) select id, 1, 0 from partidas where grupo = '${grupo}' and copa_fase = ${fase};`);
// só a Sul-Americana jogou as oitavas: a Libertadores espera, a Sul-Americana avança sozinha
await jogar("SUL", 3);
assert.strictEqual((await q(`select lib_avancar(1) n`))[0].n, 4);
assert.strictEqual((await q(`select count(*)::int c from partidas where grupo = 'SUL' and copa_fase = 4 and rodada = 304 and chave is not null`))[0].c, 4);
assert.strictEqual((await q(`select count(*)::int c from partidas where grupo = 'LIB' and copa_fase = 4`))[0].c, 0);
assert.strictEqual((await q(`select sum(valor)::int s from lancamentos where descricao like 'Sul-Americana: prêmio por chegar às quartas'`))[0].s, 8 * 70);
for (const f of [4, 5]) { await jogar("SUL", f); await q(`select lib_avancar(1)`); }
await jogar("SUL", 6); await jogar("REC", 6);
await q(`select lib_avancar(1)`);
const copa = (await q(`select copa, fundo_taca from ligas`))[0];
assert.strictEqual(+copa.copa.sul.campeao, 17); assert.strictEqual(+copa.copa.rec.campeao, 33); assert.ok(!copa.copa.lib.campeao);
assert.strictEqual(copa.fundo_taca, -(8 * 70 + 4 * 100 + 850 + 250 + 500));
assert.strictEqual((await q(`select caixa from financas where clube_id = 17`))[0].caixa, 70 + 100 + 850);
// a Libertadores segue normal depois
for (const f of [3, 4, 5, 6]) { await jogar("LIB", f); await q(`select lib_avancar(1)`); }
assert.strictEqual(+(await q(`select copa from ligas`))[0].copa.lib.campeao, 1);
// virada: campeões no histórico
await q(`select virar_temporada_com_guardas(1, '{}')`);
const h = Object.fromEntries((await q(`select clube_id, lib, sul, recopa from historico where lib is not null or sul is not null or recopa`)).map(x => [x.clube_id, x]));
assert.strictEqual(h[1].lib, "campeão"); assert.strictEqual(h[17].sul, "campeão"); assert.strictEqual(h[33].recopa, true);
assert.strictEqual(Object.values(h).filter(x => x.sul === "vice").length, 1); assert.strictEqual(Object.values(h).filter(x => x.lib === "vice").length, 1);
console.log("SQL: ok");
