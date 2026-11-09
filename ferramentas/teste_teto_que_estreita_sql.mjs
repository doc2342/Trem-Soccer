// Confere o supabase/176_teto_que_estreita.sql num Postgres em memória (PGlite): a faixa do olheiro estreita com os jogos pelo clube
// (temporada atual, temporadas anteriores e base), cada faixa fica dentro da anterior, o teto aparece exato e o arquivo roda duas vezes.
// Uso: node ferramentas/teste_teto_que_estreita_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
import { folgaDoTeto, tetoDaNota } from "../src/treino.js";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.atual (uid uuid);
create function auth.uid() returns uuid language sql as $$ select uid from auth.atual $$;
create table clubes (id bigint primary key, dono uuid);
create table jogadores (id bigint primary key, clube_id bigint);
create table jogadores_ocultos (jogador_id bigint primary key, tal smallint);
create table treinadores (clube_id bigint, skill int, contratado boolean, funcao text);
create table partidas (id bigint primary key, casa bigint, fora bigint);
create table resultados (partida_id bigint, relatorio jsonb);
create table jogadores_historico (jogador_id bigint, clube_id bigint, jogos int);
create table relatorios (clube_id bigint, jogador_id bigint, nivel smallint, minimo int, maximo int);
create table base_jogos (id bigint primary key, casa bigint, fora bigint, processada boolean, dados jsonb);
create function relatorio_do_elenco() returns table (jogador_id bigint, minimo int, maximo int) language sql as $$ select 1::bigint, 1, 1 $$;
insert into clubes values (1, '00000000-0000-0000-0000-000000000001'), (2, null);
insert into jogadores values (10, 1), (11, 1), (12, 1);
insert into jogadores_ocultos values (10, 65), (11, 65), (12, 65); -- teto 36
insert into treinadores values (1, 25, true, 'olheiro');
insert into auth.atual values ('00000000-0000-0000-0000-000000000001');
`);
const sql = fs.readFileSync(new URL("../supabase/176_teto_que_estreita.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // idempotente
// a folga do SQL é a mesma do JavaScript (mulberry32 em 32 bits)
for (let id = 1; id <= 3000; id += 7) for (const tal of [1, 37, 65, 100]) {
  const sql = (await q(`select folga_do_teto($1, $2) as f`, [id, tal]))[0].f;
  assert.strictEqual(sql, folgaDoTeto("j" + id, tal), `folga do jogador ${id}, talento ${tal}`);
}
const faixa = async id => (await q(`select minimo, maximo, jogos from relatorio_do_elenco() where jogador_id = $1`, [id]))[0];
const f0 = await faixa(10);
assert.strictEqual(f0.jogos, 0);
assert.ok(f0.maximo - f0.minimo >= 9 && f0.minimo <= 39 && f0.maximo >= 36, "sem jogos: a largura do olheiro (9,5 com skill 25)");
// 20 jogos pelo clube (10 pelo time da casa, 10 de visitante, só os que entraram): a largura cai à metade, dentro da anterior
for (let k = 0; k < 20; k++) {
  const casa = k % 2 === 0, rel = { jogadores: [{ id: "j10", time: casa ? 0 : 1, minutos: 90 }, { id: "j11", time: casa ? 0 : 1, minutos: 0 }] };
  await q(`insert into partidas values ($1, $2, $3)`, [k + 1, casa ? 1 : 2, casa ? 2 : 1]);
  await q(`insert into resultados values ($1, $2)`, [k + 1, JSON.stringify(rel)]);
}
const f1 = await faixa(10);
assert.strictEqual(f1.jogos, 20);
assert.ok(f1.maximo - f1.minimo < f0.maximo - f0.minimo && f1.minimo >= f0.minimo && f1.maximo <= f0.maximo && f1.minimo <= 39 && f1.maximo >= 36, JSON.stringify([f0, f1]));
assert.strictEqual((await faixa(11)).jogos, 0, "banco sem entrar em campo não conta");
// temporadas anteriores (só pelo clube atual) e a base também contam: com muitos jogos o teto aparece exato
await q(`insert into jogadores_historico values (10, 1, 50), (10, 2, 30), (12, 2, 40)`);
await q(`insert into base_jogos values (1, 1, 2, true, $1), (2, 2, 1, true, $2), (3, 1, 2, false, $1)`,
  [JSON.stringify({ jogadores: [{ id: "j12", t: 0, min: 90 }] }), JSON.stringify({ jogadores: [{ id: "j12", t: 1, min: 90 }] })]);
const f2 = await faixa(10);
assert.strictEqual(f2.jogos, 70);
const real = Math.round(tetoDaNota(65) + folgaDoTeto("j10", 65));
assert.deepStrictEqual([f2.minimo, f2.maximo], [real, real], "70 jogos: teto exato (com a folga)");
assert.strictEqual((await faixa(12)).jogos, 2, "base processada pelo clube conta; histórico por outro clube não");
// sem olheiro, nada
await q(`update treinadores set contratado = false`);
assert.strictEqual((await q(`select * from relatorio_do_elenco()`)).length, 0);
console.log("teto que estreita (176): ok");
