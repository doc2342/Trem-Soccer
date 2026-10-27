// Confere o supabase/158_multa_dos_bots_no_reinicio.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_multa_dos_bots_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, dono uuid, grupo text);
create table jogadores (id bigint primary key, clube_id bigint, protegido_ate int, chegou_temporada int, juvenil boolean);
insert into ligas values (1, 0), (2, 3);
insert into clubes values (1, 1, null, 'A'), (2, 1, gen_random_uuid(), 'A'), (3, 1, null, 'X'), (4, 2, null, 'A');
insert into jogadores values
  (10, 1, 0, null, false),  -- bot, gerado no reinício: perde a proteção
  (11, 1, 0, 0, false),     -- bot, chegou nesta temporada (comprou de alguém): fica protegido
  (12, 1, 0, null, true),   -- juvenil do bot: não mexe
  (20, 2, 0, null, false),  -- dirigente: fica protegido
  (30, 3, 0, null, false),  -- guardado (X): não mexe
  (40, 4, 3, null, false);  -- liga fora da temporada 0: não mexe
`);
const sql = fs.readFileSync(new URL("../supabase/158_multa_dos_bots_no_reinicio.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const p = Object.fromEntries((await q(`select id, protegido_ate from jogadores`)).map(r => [r.id, r.protegido_ate]));
assert.deepStrictEqual(p, { 10: null, 11: 0, 12: 0, 20: 0, 30: 0, 40: 3 });
console.log("158 multa dos bots: ok");
