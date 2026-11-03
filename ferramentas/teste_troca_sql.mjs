// Confere o supabase/174_pedido_de_troca.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_troca_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const U1 = "00000000-0000-0000-0000-000000000001";
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.sessao (uid uuid);
create function auth.uid() returns uuid language sql as $$ select uid from auth.sessao $$;
create table admin_flag (sim boolean); insert into admin_flag values (true);
create function eh_admin() returns boolean language sql as $$ select sim from admin_flag $$;
create table clubes (id bigint primary key, liga_id bigint, dono uuid, nome text, sigla text, escudo jsonb default '{}', estadio_visual jsonb, escudo_troca boolean not null default false);
insert into clubes values (1, 1, '${U1}', 'Trem', 'TRE', '{"forma": 1, "img": "1-1.webp"}', '{"nomeEstadio": "Feio", "mosaico": "FEIO", "padrao": "sigla"}', false),
  (2, 1, null, 'Outro', 'OUT', '{}', null, false);
create table partidas (liga_id bigint, fase text, rodada int, inicio timestamptz);
insert into partidas values (1, 'liga', 1, now() + interval '1 day');
insert into auth.sessao values ('${U1}');`);
const sql = fs.readFileSync(new URL("../supabase/174_pedido_de_troca.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql);
const c1 = async () => (await q("select * from clubes where id = 1"))[0];
const erro = async s => { try { await db.exec(s); } catch (e) { return e.message; } assert.fail("devia dar erro: " + s); };

// antes da 1ª rodada, troca à vontade; depois, só com o pedido
assert.strictEqual((await q("select pode_renomear_clube() v"))[0].v, true);
await db.exec("select renomear_clube('Trem', 'TRM')"); assert.strictEqual((await c1()).sigla, "TRM");
await db.exec("update partidas set inicio = now() - interval '1 hour'");
assert.strictEqual((await q("select pode_renomear_clube() v"))[0].v, false);
assert.match(await erro("select renomear_clube('Trem Novo', 'TRN')"), /a pedido do administrador/);
// pedido do administrador: imagem, nome do estádio e mosaico saem; o resto fica
await db.exec("select pedir_troca(1, array['escudo', 'nome', 'estadio', 'mosaico'])");
let c = await c1();
assert.deepStrictEqual(c.troca_pedida, ["escudo", "estadio", "mosaico", "nome"]);
assert.deepStrictEqual(c.escudo, { forma: 1 }); assert.deepStrictEqual(c.estadio_visual, { padrao: "sigla" }); assert.strictEqual(c.escudo_troca, true);
// salvar o estádio com o nome em branco não conta como troca; com nome novo, conta
await db.exec(`update clubes set estadio_visual = '{"padrao": "setor", "nomeEstadio": ""}' where id = 1`);
assert.ok((await c1()).troca_pedida.includes("estadio"));
await db.exec(`update clubes set estadio_visual = '{"padrao": "setor", "nomeEstadio": "Novo", "mosaico": "NOVO"}' where id = 1`);
assert.deepStrictEqual((await c1()).troca_pedida, ["escudo", "nome"]);
// o escudo sai do pedido quando o dirigente mexe nele
await db.exec(`update clubes set escudo = '{"forma": 2}' where id = 1`);
c = await c1(); assert.deepStrictEqual(c.troca_pedida, ["nome"]); assert.strictEqual(c.escudo_troca, false);
// renomear: regras do pedido de clube, e o nome sai do pedido
assert.match(await erro("select renomear_clube('Outro', 'OUT')"), /Já existe/);
assert.match(await erro("select renomear_clube('Trem Novo', 'TR')"), /sigla/);
await db.exec("select renomear_clube('  Trem Novo ', 'trn')");
c = await c1(); assert.strictEqual(c.nome, "Trem Novo"); assert.strictEqual(c.sigla, "TRN"); assert.deepStrictEqual(c.troca_pedida, []);
// a chamada antiga segue valendo; troca de dono limpa tudo
await db.exec("select pedir_troca_de_escudo(1)"); assert.deepStrictEqual((await c1()).troca_pedida, ["escudo"]);
await db.exec("update clubes set dono = null where id = 1"); assert.deepStrictEqual((await c1()).troca_pedida, []);
// só o administrador pede, e o pedido precisa de itens conhecidos
assert.match(await erro("select pedir_troca(2, array['uniforme'])"), /Escolha/);
await db.exec("update admin_flag set sim = false");
assert.match(await erro("select pedir_troca(2, array['nome'])"), /Sem permissão/);
console.log("teste_troca_sql: ok");
