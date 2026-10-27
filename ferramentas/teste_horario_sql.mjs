// Confere o supabase/156_mudar_horario_das_partidas.sql num Postgres em memória (PGlite): as partidas e os jogos de base que faltam e as datas
// reservadas da copa andam juntos; as calculadas, as com a tática fechada e as datas passadas ficam; adiantar para perto de agora é recusado
// e o arquivo roda duas vezes. Uso: node ferramentas/teste_horario_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const sql = fs.readFileSync(new URL("../supabase/156_mudar_horario_das_partidas.sql", import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create function eh_admin() returns boolean language sql as $$ select true $$;
create table ligas (id bigint primary key, prazo_escalacao_seg int, copa jsonb);
create table partidas (id int primary key, liga_id bigint, processada boolean, inicio timestamptz, fim timestamptz);
create table base_jogos (id int primary key, liga_id bigint, processada boolean, inicio timestamptz);
insert into ligas values (1, 900, jsonb_build_object(
  'datas', jsonb_build_array(jsonb_build_object('inicio', now() - interval '1 day', 'fim', now() - interval '22 hours'), jsonb_build_object('inicio', now() + interval '2 days', 'fim', now() + interval '2 days 105 minutes')),
  'lib', jsonb_build_object('datas', jsonb_build_array(jsonb_build_object('inicio', now() + interval '3 days', 'fim', now() + interval '3 days 105 minutes'))),
  'diretos', jsonb_build_array(5, 6)));
insert into partidas values
  (1, 1, true,  now() - interval '1 day', now() - interval '22 hours'),   -- calculada
  (2, 1, false, now() + interval '5 minutes', now() + interval '110 minutes'), -- tática fechada
  (3, 1, false, now() + interval '1 day', now() + interval '1 day 105 minutes');
insert into base_jogos values (1, 1, false, now() + interval '1 day'), (2, 1, true, now() - interval '1 day');
`);
await db.exec(sql); await db.exec(sql); // roda duas vezes
const antes = await q(`select (select jsonb_agg(inicio order by id) from partidas) p, (select jsonb_agg(inicio order by id) from base_jogos) b, copa from ligas`);
assert.equal((await q(`select mudar_horario_das_partidas(720) n`))[0].n, 1);
const horas = async (s) => (await q(s)).map(r => r.h);
assert.deepEqual(await horas(`select round(extract(epoch from inicio - (now() + interval '1 day')) / 3600) h from partidas where id = 3`), ["12"]);
assert.deepEqual(await horas(`select round(extract(epoch from fim - inicio) / 60) h from partidas order by id`), ["120", "105", "105"]);
assert.deepEqual(await horas(`select round(extract(epoch from inicio - now()) / 60) h from partidas where id = 2`), ["5"]); // a de tática fechada fica
assert.deepEqual(await horas(`select round(extract(epoch from inicio - now()) / 3600) h from base_jogos order by id`), ["36", "-24"]);
const copa = (await q(`select copa from ligas`))[0].copa, h = t => Math.round((new Date(t) - Date.now()) / 3600000);
assert.deepEqual(copa.datas.map(x => h(x.inicio)), [-24, 60]);
assert.deepEqual(copa.lib.datas.map(x => [h(x.inicio), h(x.fim)]), [[84, 86]]);
assert.deepEqual(copa.diretos, [5, 6]);
// volta ao que era; adiantar para antes de agora é recusado e não muda nada
await q(`select mudar_horario_das_partidas(-720)`);
const depois = await q(`select (select jsonb_agg(inicio order by id) from partidas) p, (select jsonb_agg(inicio order by id) from base_jogos) b, copa from ligas`);
assert.deepEqual(depois[0].p.map(t => new Date(t).getTime()), antes[0].p.map(t => new Date(t).getTime()));
assert.deepEqual(depois[0].copa.datas.map(x => new Date(x.inicio).getTime()), antes[0].copa.datas.map(x => new Date(x.inicio).getTime()));
await assert.rejects(q(`select mudar_horario_das_partidas(-1430)`), /menos de 10 minutos/);
await assert.rejects(q(`select mudar_horario_das_partidas(1440)`), /23h59/);
console.log("teste_horario_sql: ok");
