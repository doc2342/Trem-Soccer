// Confere o supabase/164_papel_jogado.sql num Postgres em memória (PGlite): quem troca de papel volta a entrosar por alguns jogos,
// quem repete não muda, quem não tinha papel só grava; só o servidor (ou o admin) chama; o arquivo roda duas vezes.
// Uso: node ferramentas/teste_papel_jogado_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.papel (r text);
create function auth.role() returns text language sql as $$ select r from auth.papel $$;
create function eh_admin() returns boolean language sql as $$ select false $$;
create table partidas (id bigint primary key, casa bigint, fora bigint);
create table jogadores (id bigint primary key, clube_id bigint, entrosar smallint not null default 0);
insert into partidas values (1, 1, 2);
insert into jogadores values (10, 1, 0), (11, 1, 0), (12, 1, 5), (20, 2, 0), (30, 3, 0);
insert into auth.papel values ('service_role');
`);
const sql = fs.readFileSync(new URL("../supabase/164_papel_jogado.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec(sql); // idempotente
const marcar = lista => q(`select marcar_papeis(1, $1::jsonb, 3)`, [JSON.stringify(lista)]);
const ent = async id => (await q(`select entrosar, papel_jogado from jogadores where id = $1`, [id]))[0];
// primeiro jogo com papel: só grava
await marcar([{ id: 10, papel: "fixo" }, { id: 11, papel: "apoiador" }, { id: 12, papel: "fixo" }, { id: 30, papel: "fixo" }]);
assert.deepStrictEqual(await ent(10), { entrosar: 0, papel_jogado: "fixo" });
assert.deepStrictEqual(await ent(30), { entrosar: 0, papel_jogado: null }, "jogador de outro clube não muda");
// segundo jogo: 10 troca (volta a entrosar por 3), 11 repete, 12 troca mas já tinha 5 (fica 5)
await marcar([{ id: 10, papel: "apoiador" }, { id: 11, papel: "apoiador" }, { id: 12, papel: "invertido" }]);
assert.deepStrictEqual(await ent(10), { entrosar: 3, papel_jogado: "apoiador" });
assert.deepStrictEqual(await ent(11), { entrosar: 0, papel_jogado: "apoiador" });
assert.deepStrictEqual(await ent(12), { entrosar: 5, papel_jogado: "invertido" });
// sem permissão
await db.exec(`update auth.papel set r = 'anon'`);
await assert.rejects(() => marcar([{ id: 10, papel: "fixo" }]), /Sem permissão/);
assert.strictEqual((await q(`select has_function_privilege('anon', 'marcar_papeis(bigint, jsonb, integer)', 'execute') as p`))[0].p, false);
console.log("papel jogado (164): ok");
