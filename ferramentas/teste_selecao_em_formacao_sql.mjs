// Confere o supabase/144_selecao_em_formacao.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_selecao_em_formacao_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table admin_flag (sim boolean); insert into admin_flag values (true);
create function eh_admin() returns boolean language sql as $$ select sim from admin_flag $$;
create table ligas (id bigint primary key, temporada int); insert into ligas values (1, 7);
create table partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, fase text, grupo text, rodada int);
create table resultados (partida_id bigint, libera_em timestamptz, relatorio jsonb);
create table premios_individuais (liga_id bigint, temporada int, comp text, premio text, jogador_id text, jogador text, pos text, clube_id bigint, valor int, numero numeric,
  primary key (liga_id, temporada, comp, premio));
`);
// 2 jogos do grupo A; cada jogador joga os dois com a mesma nota. Três laterais direitos muito bons, um só esquerdo.
const elenco = [["g1", "GK", 7], ["g2", "GK", 6], ["dr1", "DR", 9], ["dr2", "DR", 8.9], ["dr3", "DR", 8.8], ["dl1", "DL", 6], ["dc1", "DC", 7], ["dc2", "DC", 6.9], ["dc3", "SW", 6.8],
  ["mc1", "MC", 7.5], ["mc2", "MC", 7.4], ["mc3", "MC", 7.3], ["dm1", "DMC", 7.2], ["mr1", "MR", 6], ["ml1", "ML", 6], ["sc1", "SC", 8], ["fc1", "FC", 7.9], ["rw1", "RW", 7.6], ["lw1", "LW", 7.7],
  ["x", "AMC", 9.5]];
const jogadores = elenco.map(([id, pos, nota]) => ({ id, nome: id.toUpperCase(), pos, nota, minutos: 90, time: 0 }));
jogadores.push({ id: "pouco", nome: "POUCO", pos: "GK", nota: 10, minutos: 20, time: 0 }); // menos de 30 minutos: não conta
await q(`insert into partidas values (1, 1, 100, 200, 'liga', 'A', 1), (2, 1, 100, 200, 'liga', 'A', 2), (3, 1, 100, 200, 'liga', 'A', 4)`);
await q(`insert into resultados values (1, now() - interval '1 h', $1), (2, now() - interval '1 h', $1), (3, now() + interval '1 h', '{}')`, [JSON.stringify({ jogadores })]);
const sql = fs.readFileSync(new URL("../supabase/144_selecao_em_formacao.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
assert.equal((await q(`select selecao_da_temporada(1) n`))[0].n, 11);
const sel = await q(`select premio, jogador_id, pos, numero from premios_individuais order by premio`);
assert.equal(sel.length, 11);
const pos = sel.map(s => s.pos), ids = sel.map(s => s.jogador_id);
assert.equal(pos.filter(p => p === "DR" || p === "WBR").length <= 1, true, "no máximo um lateral direito: " + pos);
assert.equal(pos[0], "GK"); assert.equal(ids[0], "g1", "o melhor goleiro");
assert.ok(ids.includes("x"), "o AMC de 9,5 entra: a formação escolhida tem vaga de AMC");
assert.ok(ids.includes("dr1") && !ids.includes("dr2"), "só o melhor lateral direito");
assert.ok(!ids.includes("pouco"), "menos de 30 minutos não conta");
// segunda chamada não duplica
assert.equal((await q(`select selecao_da_temporada(1) n`))[0].n, 0);
console.log("tudo certo");
