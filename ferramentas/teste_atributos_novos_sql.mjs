// Confere o supabase/172_atributos_novos.sql num Postgres em memória (PGlite): at aceita 22 e 25, aplicar_treino grava os dois tamanhos,
// aplicar_atributos_novos entrega só a quem falta, e o arquivo roda duas vezes.
// Uso: node ferramentas/teste_atributos_novos_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table admin_agora (sim boolean); insert into admin_agora values (true);
create function eh_admin() returns boolean language sql as $$ select sim from admin_agora $$;
create schema auth; create table auth.atual (uid uuid); insert into auth.atual values ('00000000-0000-0000-0000-000000000001');
create function auth.uid() returns uuid language sql as $$ select uid from auth.atual $$;
create table clubes (id bigint primary key, dono uuid); insert into clubes values (1, '00000000-0000-0000-0000-000000000001');
create table jogadores (id bigint primary key, clube_id bigint default 1, at smallint[] not null check (array_length(at, 1) = 22), treino_pts smallint[], treino jsonb, fam jsonb, aprende jsonb);
create table jogadores_ocultos (jogador_id bigint primary key, tal smallint, no_teto boolean not null default false);
`);
// definir_treino como está no ar (27): o 172 tem que trocar o limite de índices, que vai até 21
await db.exec(fs.readFileSync(new URL("../supabase/27_treino.sql", import.meta.url), "utf8").match(/create or replace function public\.definir_treino[\s\S]*?end \$\$;/)[0]);
const sql = fs.readFileSync(new URL("../supabase/172_atributos_novos.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec(sql); // idempotente

const v = (n, x) => Array(n).fill(x);
const novo = async (id, n, pts = null) => q(`insert into jogadores (id, at, treino_pts) values ($1, $2, $3)`, [id, v(n, 20), pts]);
const tam = async id => { const [r] = await q(`select at, treino_pts from jogadores where id = $1`, [id]); return r; };
const treina = (l) => q(`select aplicar_treino($1::jsonb) as n`, [JSON.stringify(l)]).then(r => r[0].n);
const entrega = l => q(`select aplicar_atributos_novos($1::jsonb) as n`, [JSON.stringify(l)]).then(r => r[0].n);

// o CHECK: 22 e 25 passam, 24 falha
await novo(1, 22); await novo(2, 25);
await assert.rejects(novo(3, 24), /check/i);

// aplicar_treino: mesmo tamanho (22 ou 25) grava; tamanhos diferentes ou 23 não
assert.strictEqual(await treina([{ id: 1, at: v(22, 21), pts: v(22, 1) }]), 1);
assert.strictEqual(await treina([{ id: 2, at: v(25, 21), pts: v(25, 1) }]), 1);
assert.strictEqual((await tam(2)).at[24], 21);
assert.strictEqual(await treina([{ id: 2, at: v(25, 22), pts: v(22, 1) }]), 0);
assert.strictEqual(await treina([{ id: 1, at: v(23, 22), pts: v(23, 1) }]), 0);
assert.strictEqual((await tam(2)).at[24], 21);

// salvar o foco com os atributos novos (MC automático: dec, plo, res = 24, 22, 17): a lista inteira falharia e travaria o elenco todo
const foco = l => q(`select definir_treino($1::jsonb) as n`, [JSON.stringify(l)]).then(r => r[0].n);
assert.strictEqual(await foco([{ id: 2, p: "meia", c: [24, 22, 17] }]), 1);
assert.deepStrictEqual((await q(`select treino from jogadores where id = 2`))[0].treino, { p: "meia", c: [24, 22, 17] });
await assert.rejects(foco([{ id: 2, p: "meia", c: [25] }]), /foco complementar/);
await assert.rejects(foco([{ id: 2, p: "meia", c: [1, 2, 3, 4] }]), /foco complementar/);

// entrega: 22 vira 25 com os 3 no fim; treino_pts ganha zeros, null continua null
await novo(4, 22, v(22, 7)); await novo(5, 22);
const lista = [{ id: 4, novos: [31, 32, 33] }, { id: 5, novos: [1, 2, 3] }];
assert.strictEqual(await entrega(lista), 2);
const j4 = await tam(4), j5 = await tam(5);
assert.deepStrictEqual(j4.at.slice(20), [20, 20, 31, 32, 33]);
assert.deepStrictEqual(j4.treino_pts.slice(20), [7, 7, 0, 0, 0]);
assert.strictEqual(j5.treino_pts, null);

// repetir (virada pela metade): quem já tem 25 fica como está e não soma 6 atributos
assert.strictEqual(await entrega([...lista, { id: 1, novos: [9, 9, 9] }]), 1);
assert.strictEqual((await tam(4)).at.length, 25);
assert.strictEqual((await tam(1)).at[22], 9);

// lista com tamanho errado falha alto, não grava pela metade
await novo(6, 22);
await assert.rejects(entrega([{ id: 6, novos: [1, 2] }]));
assert.strictEqual((await tam(6)).at.length, 22);

// só administrador
await q(`update admin_agora set sim = false`);
await assert.rejects(entrega([{ id: 6, novos: [1, 2, 3] }]), /administrador/i);
assert.strictEqual((await tam(6)).at.length, 22);

// quem pode chamar
const pode = (papel, f) => q(`select has_function_privilege($1, $2, 'execute') as p`, [papel, f]).then(r => r[0].p);
assert.strictEqual(await pode("anon", "aplicar_atributos_novos(jsonb)"), false);
assert.strictEqual(await pode("authenticated", "aplicar_atributos_novos(jsonb)"), true);
assert.strictEqual(await pode("authenticated", "aplicar_treino(jsonb)"), false);
assert.strictEqual(await pode("service_role", "aplicar_treino(jsonb)"), true);
console.log("atributos novos (172): ok");
