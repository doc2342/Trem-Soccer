// Confere o supabase/173_selecao_da_rodada.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_selecao_da_rodada_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, fase text, grupo text, rodada int);
create table resultados (partida_id bigint, libera_em timestamptz, relatorio jsonb);
`);
const anterior = fs.readFileSync(new URL("../supabase/144_selecao_em_formacao.sql", import.meta.url), "utf8");
await db.exec(anterior.slice(anterior.indexOf("create or replace function public.vaga_da_selecao"), anterior.indexOf("$$;", anterior.indexOf("vaga_da_selecao")) + 3));
const elenco = [["g1", "GK", 7], ["g2", "GK", 6], ["dr1", "DR", 9], ["dr2", "DR", 8.9], ["dl1", "DL", 6], ["dc1", "DC", 7], ["dc2", "DC", 6.9], ["dc3", "SW", 6.8],
  ["mc1", "MC", 7.5], ["mc2", "MC", 7.4], ["mc3", "MC", 7.3], ["dm1", "DMC", 7.2], ["mr1", "MR", 6], ["ml1", "ML", 6], ["sc1", "SC", 8], ["fc1", "FC", 7.9], ["rw1", "RW", 7.6], ["lw1", "LW", 7.7]];
const jogadores = elenco.map(([id, pos, nota], k) => ({ id, nome: id.toUpperCase(), pos, nota, minutos: 90, time: k % 2 }));
jogadores.push({ id: "pouco", nome: "POUCO", pos: "GK", nota: 10, minutos: 20, time: 0 }); // menos de 30 minutos: não conta
await q(`insert into partidas values (1, 1, 100, 200, 'liga', 'A', 1), (2, 1, 300, 400, 'liga', 'A', 2), (3, 1, 500, 600, 'liga', 'A', 2), (4, 1, 100, 200, 'liga', 'B', 1), (5, 1, 100, 200, 'liga', 'A', 3)`);
await q(`insert into resultados values (1, now() - interval '1 h', $1), (2, now() - interval '1 h', $1), (3, now() + interval '1 h', $1), (4, now() - interval '1 h', '{"jogadores":[]}')`, [JSON.stringify({ jogadores })]);
const sql = fs.readFileSync(new URL("../supabase/173_selecao_da_rodada.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const sel = async (g, r) => (await q(`select selecao_da_rodada(1, $1, $2) s`, [g, r]))[0].s;
const s = await sel("A", 1), ids = s.map(x => x.id);
assert.equal(s.length, 11); assert.deepEqual(s.map(x => x.i), [...s.map(x => x.i)].sort((a, b) => a - b), "na ordem da formação");
assert.equal(s[0].vaga, "GK"); assert.equal(s[0].id, "g1", "o melhor goleiro");
assert.ok(ids.includes("dr1") && !ids.includes("pouco"), "menos de 30 minutos não conta");
assert.equal(s.find(x => x.id === "dr1").clube, 100, "time 0 é o mandante"); assert.equal(s.find(x => x.id === "dc1").clube, 200, "time 1 é o visitante");
assert.equal(new Set(ids).size, 11, "ninguém repetido");
assert.deepEqual(await sel("A", 2), [], "rodada com jogo por liberar não sai");
assert.deepEqual(await sel("A", 3), [], "rodada sem resultado não sai");
assert.deepEqual(await sel("B", 1), [], "sem onze completo não sai");
console.log("tudo certo");
