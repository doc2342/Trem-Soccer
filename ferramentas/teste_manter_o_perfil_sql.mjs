// Confere o supabase/177_manter_o_perfil.sql (PGlite): definir_treino grava o "m" (manter o perfil no teto), com e sem foco, e roda duas vezes.
// Uso: node ferramentas/teste_manter_o_perfil_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.atual (uid uuid);
create function auth.uid() returns uuid language sql as $$ select uid from auth.atual $$;
create table clubes (id bigint primary key, dono uuid);
create table jogadores (id bigint primary key, clube_id bigint, treino jsonb);
insert into clubes values (1, '00000000-0000-0000-0000-000000000001');
insert into jogadores values (10, 1, null), (11, 1, null), (12, 1, null), (20, 2, null);
insert into auth.atual values ('00000000-0000-0000-0000-000000000001');
`);
const sql = fs.readFileSync(new URL("../supabase/177_manter_o_perfil.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql);
const n = (await q(`select definir_treino($1::jsonb) as n`, [JSON.stringify([{ id: 10, p: "meia", c: [1, 2], m: true }, { id: 11, p: "meia", c: [1] }, { id: 12, m: true }, { id: 20, p: "meia", c: [], m: true }])]))[0].n;
assert.strictEqual(n, 3, "jogador de outro clube não conta");
const t = async id => (await q(`select treino from jogadores where id = $1`, [id]))[0].treino;
assert.deepStrictEqual(await t(10), { p: "meia", c: [1, 2], m: true });
assert.deepStrictEqual(await t(11), { p: "meia", c: [1] });
assert.deepStrictEqual(await t(12), { m: true });
assert.strictEqual(await t(20), null);
await assert.rejects(q(`select definir_treino($1::jsonb)`, [JSON.stringify([{ id: 10, p: "xxx", c: [] }])]));
console.log("manter o perfil (177): ok");
