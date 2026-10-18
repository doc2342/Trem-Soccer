// Confere o supabase/121_economia_da_temporada.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_economia_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table admin_flag (sim boolean); insert into admin_flag values (true);
create function eh_admin() returns boolean language sql as $$ select sim from admin_flag $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, dono uuid);
create table financas (clube_id bigint primary key, caixa int);
create table jogadores (id serial primary key, clube_id bigint, salario int);
create table historico (liga_id bigint, temporada int, clube_id bigint, grupo text);
create table lancamentos (clube_id bigint, temporada int, tipo text, valor int);
insert into ligas values (1, 13);
insert into clubes values (1, 1, 'A', gen_random_uuid()), (2, 1, 'A', null), (3, 1, 'B', null);
insert into financas values (1, 5000), (2, 3000), (3, -100);
insert into jogadores (clube_id, salario) values (1, 1000), (1, 1000), (2, 500), (3, 300);
-- clube 2 jogou a T13 na B e subiu: o grupo da temporada vem do histórico
insert into historico values (1, 13, 1, 'A'), (1, 13, 2, 'B'), (1, 13, 3, 'B');
insert into lancamentos values (1, 13, 'tv', 4000), (1, 13, 'salarios', -6000), (1, 13, 'venda', 1000), (1, 13, 'premio', 2000),
  (2, 13, 'tv', 1000), (2, 13, 'salarios', -3000), (3, 13, 'tv', 1000), (3, 13, 'salarios', -2000), (3, 12, 'tv', 99999);
`);
await db.exec(fs.readFileSync(new URL("../supabase/121_economia_da_temporada.sql", import.meta.url), "utf8"));
await db.exec(fs.readFileSync(new URL("../supabase/121_economia_da_temporada.sql", import.meta.url), "utf8")); // rodar duas vezes
const e = Object.fromEntries((await q(`select x from economia_da_temporada(1, 13) x`)).map(r => [r.x.grupo, r.x]));
assert.deepEqual([e.A.clubes, e.A.dirigentes, e.A.caixa_media, e.A.folha_media, e.A.operacional, e.A.premio, e.A.saldo], [1, 1, 5000, 2000, -2000, 2000, 1000]);
assert.deepEqual([e.B.clubes, e.B.caixa_min, e.B.caixa_max, e.B.operacional, e.B.no_vermelho, e.B.vermelho_em_2], [2, -100, 3000, -1500, 1, 1]);
assert.equal(e.B.por_tipo.tv, 1000);
await db.exec(`update admin_flag set sim = false`);
assert.equal((await q(`select x from economia_da_temporada(1, 13) x`)).length, 0, "só admin");
await db.exec(`update ligas set temporada = 14`);
const g = await q(`select grupo, dados from economia_temporadas order by grupo`);
assert.deepEqual(g.map(x => x.grupo), ["A", "B"]);
assert.equal(g[0].dados.saldo, 1000);
await db.exec(`update ligas set temporada = 14`); // sem virada: não regrava nem dá erro
console.log("tudo certo");
