// Confere o supabase/161_batismo_da_joia.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_batismo_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const DONO = "00000000-0000-0000-0000-000000000001", OUTRO = "00000000-0000-0000-0000-000000000002";
await db.exec(`
create role anon; create role authenticated;
create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
create function eh_admin() returns boolean language sql as $$ select current_setting('teste.admin', true) = '1' $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, dono uuid);
create table jogadores (id bigint primary key, clube_id bigint references clubes, nome text, nome_completo text);
create table safras (id bigserial primary key, liga_id bigint references ligas, temporada int, clube_id bigint references clubes, jogador text, pos text, idade smallint, nivel smallint, publico boolean);
create table partidas (liga_id bigint, processada boolean);
create table revelados (jogador_id bigint, nome text);
insert into ligas values (1, 2);
insert into clubes values (1, 1, '${DONO}'), (2, 1, '${OUTRO}');
insert into jogadores values (10, 1, 'Zé', 'José Sorteado'), (11, 2, 'Pelé', 'Edson Arantes');
insert into safras (id, liga_id, temporada, clube_id, jogador, nivel, publico) values (5, 1, 2, 1, 'Zé', 43, true), (6, 1, 1, 1, 'Zé', 42, true);
insert into revelados values (10, 'Zé');
`);
const sql = fs.readFileSync(new URL("../supabase/161_batismo_da_joia.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const como = async (uid, admin = false) => { await q(`select set_config('teste.uid', $1, false)`, [uid]); await q(`select set_config('teste.admin', $1, false)`, [admin ? "1" : ""]); };
const batizar = (n, c, s = 5) => q(`select batizar_joia($1, $2, $3)`, [s, n, c]);

await como(OUTRO);
await assert.rejects(batizar("Tremzinho", "Trem da Silva"), /não é do seu clube/);
await como(DONO);
await assert.rejects(batizar("Tremzinho", "Trem da Silva", 6), /temporada em que a joia chega/);
await assert.rejects(batizar("X", "Trem da Silva"), /Nome de camisa/);
await assert.rejects(batizar("Trem1", "Trem da Silva"), /Nome de camisa/);
await assert.rejects(batizar("Tremzinho", "Tr"), /Nome completo/);
await assert.rejects(batizar("PELÉ", "Outro Pele"), /Já existe um PELÉ/, "camisa não repete, sem acento nem caixa");
await assert.rejects(q(`select decidir_batismo(5, true)`), /Só o administrador/);
await batizar("Tremzinho", "Trem da Silva");
await batizar("Trenzinho", "Trem da Silva Junior"); // a proposta nova substitui a pendente
let b = (await q(`select * from batismos`))[0];
assert.deepEqual([b.nome, b.nome_completo, b.estado, b.nome_antigo, +b.jogador_id], ["Trenzinho", "Trem da Silva Junior", "pendente", "Zé", 10]);

await como("", true);
await q(`select decidir_batismo(5, false, 'Muito parecido com o clube')`);
assert.equal((await q(`select motivo from batismos`))[0].motivo, "Muito parecido com o clube");
assert.equal((await q(`select nome from jogadores where id = 10`))[0].nome, "Zé", "recusado não troca nada");
await assert.rejects(q(`select decidir_batismo(5, true)`), /não está pendente/);

await como(DONO);
await batizar("Joia", "Joaquim Joia");
await como("", true);
await q(`select decidir_batismo(5, true)`);
assert.deepEqual(Object.values((await q(`select nome, nome_completo from jogadores where id = 10`))[0]), ["Joia", "Joaquim Joia"]);
assert.equal((await q(`select jogador from safras where id = 5`))[0].jogador, "Joia");
assert.equal((await q(`select nome from revelados`))[0].nome, "Joia");
await como(DONO);
await assert.rejects(batizar("Outro", "Outro Nome"), /já foi batizada/);

// prazo: depois da primeira partida da temporada não dá mais
await db.exec(`delete from batismos; update jogadores set nome = 'Zé' where id = 10; update safras set jogador = 'Zé' where id = 5; insert into partidas values (1, true)`);
await assert.rejects(batizar("Tremzinho", "Trem da Silva"), /prazo acabou/);
console.log("batismo da joia: ok");
