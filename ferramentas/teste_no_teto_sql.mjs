// Confere o supabase/163_no_teto.sql num Postgres em memória (PGlite): aplicar_treino grava a marca do teto em jogadores_ocultos,
// no_teto_do_elenco devolve só o elenco do dono, e o arquivo roda duas vezes.
// Uso: node ferramentas/teste_no_teto_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.atual (uid uuid);
create function auth.uid() returns uuid language sql as $$ select uid from auth.atual $$;
create table clubes (id bigint primary key, dono uuid);
create table jogadores (id bigint primary key, clube_id bigint, at smallint[], treino_pts smallint[], fam jsonb, aprende jsonb);
create table jogadores_ocultos (jogador_id bigint primary key, tal smallint);
insert into clubes values (1, '00000000-0000-0000-0000-000000000001'), (2, '00000000-0000-0000-0000-000000000002');
insert into jogadores (id, clube_id) values (10, 1), (11, 1), (20, 2);
insert into jogadores_ocultos values (10, 50), (11, 50), (20, 50);
insert into auth.atual values ('00000000-0000-0000-0000-000000000001');
`);
const sql = fs.readFileSync(new URL("../supabase/163_no_teto.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec(sql); // idempotente
const at = Array(22).fill(20), pts = Array(22).fill(0);
// 10 parou no teto, 11 treinou, 20 (outro clube) parou; item sem "teto" (função antiga) não mexe na marca
await q(`select aplicar_treino($1::jsonb)`, [JSON.stringify([{ id: 10, at, pts, teto: true }, { id: 11, at, pts, teto: false }, { id: 20, at, pts, teto: true }])]);
assert.deepStrictEqual((await q(`select jogador_id from jogadores_ocultos where no_teto order by 1`)).map(r => +r.jogador_id), [10, 20]);
assert.deepStrictEqual((await q(`select no_teto_do_elenco() as id`)).map(r => +r.id), [10]);
await q(`select aplicar_treino($1::jsonb)`, [JSON.stringify([{ id: 10, at, pts }])]);
assert.strictEqual((await q(`select no_teto from jogadores_ocultos where jogador_id = 10`))[0].no_teto, true);
// voltou a treinar: sai da marca; o treino continua gravando os atributos
assert.strictEqual((await q(`select aplicar_treino($1::jsonb) as n`, [JSON.stringify([{ id: 10, at: Array(22).fill(21), pts, teto: false }])]))[0].n, 1);
assert.deepStrictEqual((await q(`select no_teto_do_elenco() as id`)), []);
assert.strictEqual((await q(`select at[1] as a from jogadores where id = 10`))[0].a, 21);
console.log("no teto (163): ok");
