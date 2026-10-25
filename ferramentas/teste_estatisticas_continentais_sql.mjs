// Confere o supabase/148_estatisticas_continentais.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_estatisticas_continentais_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
create function eh_admin() returns boolean language sql as $$ select true $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint);
create table jogadores (id bigint primary key, clube_id bigint, nome text, idade int, pos text, at smallint[]);
create table partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, publico int, fase text, grupo text, copa_fase int);
create table resultados (partida_id bigint, libera_em timestamptz, gols_casa int, gols_fora int, relatorio jsonb);
create table estatisticas_historico (liga_id bigint, temporada int, comp text, dados jsonb, primary key (liga_id, temporada, comp));
create table jogadores_historico (liga_id bigint, temporada int, jogador_id bigint, clube_id bigint, idade smallint, pos text, at smallint[],
  jogos int, minutos int, gols int, ass int, nota numeric, primary key (liga_id, temporada, jogador_id));
create function numeros_dos_jogadores(p_liga bigint) returns table (jid text, jogos int, minutos int, gols int, ass int, nota numeric)
  language sql as $$ select null::text, 0, 0, 0, 0, null::numeric where false $$;
create function recordes_dos_clubes(p_liga bigint, p_clube bigint default null) returns jsonb language sql as $$ select '{}'::jsonb $$;
insert into ligas values (1, 5); insert into clubes values (1, 1), (2, 1);
insert into partidas values (10, 1, 1, 2, 9000, 'liga', 'A', null), (11, 1, 2, 1, 30000, 'lib', 'LIB', 6), (12, 1, 1, 2, 5000, 'lib', 'SUL', 6), (13, 1, 1, 2, 7000, 'copa', 'COPA', 2),
  (14, 1, 2, 1, 60000, 'copa', 'COPA', 0), (15, 1, 1, 2, 40000, 'lib', 'REC', 6);
insert into resultados values
  (10, now() - interval '1 h', 1, 0, '{"jogadores":[{"time":0,"id":"j1","nome":"Ze","nota":7,"minutos":90,"gols":1}]}'),
  (11, now() - interval '1 h', 5, 1, '{"jogadores":[{"time":0,"id":"j2","nome":"Rui","nota":9,"minutos":90,"gols":4}]}'),
  (12, now() - interval '1 h', 2, 2, '{"jogadores":[{"time":1,"id":"j3","nome":"Leo","nota":8,"minutos":90,"gols":2}]}'),
  (13, now() - interval '1 h', 0, 3, '{}'), (14, now() - interval '1 h', 2, 0, '{}'), (15, now() - interval '1 h', 1, 1, '{}');
`);
const sql = fs.readFileSync(new URL("../supabase/148_estatisticas_continentais.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const e = async c => (await q(`select estatisticas_da_liga(1, $1) x`, [c]))[0].x;
assert.equal((await e("LIB")).jogos, 1); assert.equal((await e("LIB")).artilheiros[0].nome, "Rui"); assert.equal((await e("LIB")).recordes.goleada.id, 11);
assert.equal((await e("SUL")).jogos, 1); assert.equal((await e("SUL")).recordes.publico.publico, 5000);
assert.equal((await e("COPA")).jogos, 1, "copa sem a supercopa"); assert.equal((await e("COPA")).recordes.publico.publico, 7000);
assert.equal((await e("SUPER")).recordes.publico.publico, 60000, "supercopa"); assert.equal((await e("REC")).recordes.publico.publico, 40000, "recopa"); assert.equal((await e("TODOS")).jogos, 1, "séries só fase liga"); assert.equal((await e("A")).jogos, 1);
// o próprio arquivo já guardou a temporada atual
assert.deepEqual((await q(`select comp from estatisticas_historico order by comp`)).map(x => x.comp), ["COPA", "LIB", "REC", "SUL", "SUPER"]);
// e a virada guarda as continentais junto com as outras
await q(`select guardar_estatisticas(1)`);
assert.deepEqual((await q(`select comp from estatisticas_historico order by comp`)).map(x => x.comp), ["A", "COPA", "LIB", "REC", "SUL", "SUPER", "TODOS"]);
console.log("tudo certo");
