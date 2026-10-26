// Confere o supabase/153_premios_da_diretoria.sql num Postgres em memória (PGlite): a faixa do prêmio sai da confiança da temporada anterior,
// a compra extra só com 95+, a vaga a mais dos protegidos com 85+ (e o corte do de menor salário quando ela acaba), sem direito a clube extra,
// e o arquivo roda duas vezes. Uso: node ferramentas/teste_premios_diretoria_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const ler = f => fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const U1 = "00000000-0000-0000-0000-000000000001";
await db.exec(`
create role anon; create role authenticated;
create table ligas (id bigint primary key, temporada int);
create table divisoes (liga_id bigint, divisao int, teto_folha int);
create table clubes (id bigint primary key, liga_id bigint, divisao int, dono uuid, confianca smallint default 50, multas_extra smallint default 0, multas_extra_temporada int);
create table financas (clube_id bigint primary key, caixa int);
create table jogadores (id bigint primary key, clube_id bigint, nome text, salario int, protegido boolean default false);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create table confianca_historico (liga_id bigint, temporada int, clube_id bigint, antes smallint, depois smallint, detalhes jsonb, verba int default 0, primary key (liga_id, temporada, clube_id));
create table dirigentes (user_id uuid primary key, direitos int default 0);
create function eh_admin() returns boolean language sql as $f$ select true $f$;
create function janela_do_mercado(p_liga bigint) returns text language sql as $f$ select null::text $f$;
create schema auth; create function auth.uid() returns uuid language sql as $f$ select '${U1}'::uuid $f$;
insert into ligas values (1, 5);
insert into divisoes values (1, 1, 19000);
insert into clubes (id, liga_id, divisao, dono, confianca) values (1, 1, 1, '${U1}', 80), (2, 1, 1, '${U1}', 90), (3, 1, 1, '${U1}', 60);
insert into financas values (1, 0), (2, 0), (3, 0);
`);
await db.exec(ler("153_premios_da_diretoria.sql"));
await db.exec(ler("153_premios_da_diretoria.sql")); // idempotente

const premio = async (c, t) => (await q(`select premio_da_diretoria($1, $2) p`, [c, t]))[0].p;
const aplicar = async lista => (await q(`select aplicar_confianca(1, $1::jsonb) r`, [JSON.stringify(lista)]))[0].r;
const proteger = id => q(`select proteger_jogador($1, true)`, [id]);
const nProt = async c => +(await q(`select count(*) n from jogadores where clube_id = $1 and protegido`, [c]))[0].n;

// sem histórico, nenhum prêmio
assert.strictEqual(await premio(1, 5), 0);

// virada da T5: clube 1 vai a 85, clube 2 a 95, clube 3 a 70
await aplicar([{ clube_id: 1, delta: 5 }, { clube_id: 2, delta: 5 }, { clube_id: 3, delta: 10 }]);
assert.strictEqual(await premio(1, 6), 85);
assert.strictEqual(await premio(2, 6), 95);
assert.strictEqual(await premio(3, 6), 70);
const c = Object.fromEntries((await q(`select id, multas_extra, multas_extra_temporada from clubes`)).map(x => [x.id, x]));
assert.strictEqual(c[1].multas_extra, 0, "85 não dá mais compra pela multa extra");
assert.strictEqual(c[2].multas_extra, 1, "95 dá a compra extra");
assert.strictEqual(c[2].multas_extra_temporada, 6);
const verbas = Object.fromEntries((await q(`select clube_id, valor from lancamentos where tipo = 'diretoria'`)).map(x => [x.clube_id, x.valor]));
assert.deepStrictEqual(verbas, { 1: 1900, 2: 1900, 3: 950 }, "verbas de 10% e 5% do teto");
assert.strictEqual((await q(`select count(*) n from dirigentes`))[0].n, 0, "sem direito a clube extra");

// T6: clube 1 (85) protege 8, o 9º é barrado; clube 3 (70) para no 7º
await db.exec(`update ligas set temporada = 6;
  insert into jogadores (id, clube_id, nome, salario) select 100 + g, 1, 'J' || g, 100 * g from generate_series(1, 9) g;
  insert into jogadores (id, clube_id, nome, salario) select 300 + g, 3, 'K' || g, 100 * g from generate_series(1, 8) g;`);
for (let g = 1; g <= 8; g++) await proteger(100 + g);
assert.strictEqual(await nProt(1), 8);
await assert.rejects(proteger(109), /já tem 8/);
for (let g = 1; g <= 7; g++) await proteger(300 + g);
await assert.rejects(proteger(308), /já tem 7/);

// virada da T6: clube 1 cai para 75 e perde a vaga a mais; sai o de menor salário (J1)
await aplicar([{ clube_id: 1, delta: -10 }]);
assert.strictEqual(await premio(1, 7), 70);
assert.strictEqual(await nProt(1), 7);
assert.strictEqual((await q(`select protegido from jogadores where id = 101`))[0].protegido, false, "sai o de menor salário");
assert.match((await q(`select descricao from lancamentos where clube_id = 1 and valor = 0`))[0].descricao, /J1 saiu da lista/);

// aplicar de novo na mesma temporada não repete nada
assert.match(await aplicar([{ clube_id: 1, delta: 20 }]), /já tinha sido aplicada/);
console.log("prêmios da diretoria (153): ok");
