// Confere a parte 2 do supabase/175_recordes_e_evolucao.sql (foto do início com exp e idade) num Postgres em memória (PGlite).
// Uso: node ferramentas/teste_evolucao_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
create table admin_flag (sim boolean); insert into admin_flag values (true);
create function eh_admin() returns boolean language sql as $$ select sim from admin_flag $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint);
create table jogadores (id bigint primary key, clube_id bigint, livre_liga bigint, nome text, idade int, pos text, at smallint[], exp numeric, inicio_temporada jsonb);
create table partidas (id bigint primary key, liga_id bigint, casa bigint, fora bigint, publico int, fase text, grupo text);
create table resultados (partida_id bigint, libera_em timestamptz, gols_casa int, gols_fora int, relatorio jsonb);
create table historico (liga_id bigint, temporada int, clube_id bigint, grupo text, divisao int, posicao int, pontos int, gols_pro int);
create table estatisticas_historico (liga_id bigint, temporada int, comp text, dados jsonb, primary key (liga_id, temporada, comp));
create table jogadores_historico (liga_id bigint, temporada int, jogador_id bigint, clube_id bigint, idade smallint, pos text, at smallint[],
  jogos int, minutos int, gols int, ass int, nota numeric, primary key (liga_id, temporada, jogador_id));
create function estatisticas_da_liga(p_liga bigint, p_comp text) returns jsonb language sql as $$ select '{"jogos":0,"recordes":{}}'::jsonb $$;
create function recordes_dos_clubes(p_liga bigint, p_clube bigint default null) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function numeros_dos_jogadores(p_liga bigint) returns table (jid text, jogos int, minutos int, gols int, ass int, nota numeric)
  language sql as $$ select null::text, 0, 0, 0, 0, null::numeric where false $$;
insert into ligas values (1, 0), (2, 3); insert into clubes values (1, 1), (2, 2);
insert into jogadores (id, clube_id, idade, exp) values (1, 1, 24, 64), (2, 2, 30, 80), (3, 2, 22, 10);
`);
const sql = fs.readFileSync(new URL("../supabase/175_recordes_e_evolucao.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
const foto = async id => (await q(`select inicio_temporada f from jogadores where id = $1`, [id]))[0].f;
assert.equal((await q(`select marcar_inicio_da_temporada(1, '[{"id":1,"nota":30.5,"soma":300},{"id":2,"nota":1,"soma":1}]') n`))[0].n, 1, "só quem é da liga");
assert.deepEqual(await foto(1), { t: 0, nota: 30.5, soma: 300, exp: null, idade: 24 }, "T0: experiência do início nula");
assert.equal(await foto(2), null);
await q(`select marcar_inicio_da_temporada(2, '[{"id":2,"nota":40,"soma":400}]')`);
assert.deepEqual(await foto(2), { t: 3, nota: 40, soma: 400, exp: 80, idade: 30 });
await db.exec(`update admin_flag set sim = false`);
await assert.rejects(q(`select marcar_inicio_da_temporada(2, '[{"id":3,"nota":1,"soma":1}]')`), /administrador/);
assert.equal(await foto(3), null);
console.log("tudo certo");
