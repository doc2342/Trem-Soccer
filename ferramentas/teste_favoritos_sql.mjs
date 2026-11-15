// Confere o supabase/181_favoritos.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_favoritos_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const EU = "00000000-0000-0000-0000-000000000001", OUTRO = "00000000-0000-0000-0000-000000000002";
await db.exec(`
create role anon; create role authenticated;
create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create table auth.users (id uuid primary key);
insert into auth.users values ('${EU}'), ('${OUTRO}');
create table jogadores (id bigint primary key);
insert into jogadores values (10), (11);
`);
const sql = fs.readFileSync(new URL("../supabase/181_favoritos.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes

const como = async uid => { await q(`reset role`); await q(`select set_config('teste.uid', $1, false)`, [uid]); await q(`set role authenticated`); };
await como(EU);
await q(`insert into favoritos (jogador_id) values (10), (11)`); // dono sai do auth.uid()
await como(OUTRO);
await q(`insert into favoritos (jogador_id) values (10)`);
assert.deepStrictEqual((await q(`select jogador_id from favoritos`)).map(r => +r.jogador_id), [10], "só vê os próprios");
await assert.rejects(q(`insert into favoritos (dono, jogador_id) values ('${EU}', 11)`), /row-level security/, "não grava em nome de outro");
await q(`delete from favoritos where jogador_id = 11`); // não apaga o do outro (RLS filtra)
await como(EU);
assert.deepStrictEqual((await q(`select jogador_id from favoritos order by 1`)).map(r => +r.jogador_id), [10, 11]);
await q(`reset role`); await q(`delete from jogadores where id = 10`);
assert.strictEqual((await q(`select count(*)::int n from favoritos`))[0].n, 1, "jogador apagado sai dos favoritos");
console.log("181 favoritos: ok");
