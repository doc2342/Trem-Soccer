// Confere o supabase/179_troca_livre_do_estadio.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_troca_livre_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create role anon; create role authenticated;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, dono uuid, estadio_nivel smallint, ct_nivel smallint default 1, medico_nivel smallint default 1,
  fisio_nivel smallint default 1, base_nivel smallint default 1, estadio_visual jsonb);
create table financas (clube_id bigint primary key, caixa int);
create table obras (id serial primary key, clube_id bigint, estrutura text, nivel_alvo int, custo int, rodadas_total int, rodadas_restantes int, concluida boolean not null default false);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create function meu_clube() returns bigint language sql stable as $$ select nullif(current_setting('teste.clube', true), '')::bigint $$;
create function custo_da_obra(p_estrutura text, p_nivel int) returns int language sql immutable as $$
  select case when p_estrutura = 'estadio' then (array[null, 1500, 3000, 5000, 8000, 12000, 20000, 30000])[p_nivel] else (array[250, 500, 1000, 2000, 4000])[p_nivel] end $$;
create function prazo_da_obra(p_nivel int) returns int language sql immutable as $$ select (array[1, 3, 6, 10, 15, 21, 30, 42])[p_nivel] $$;
create function cidade_do_estadio(p_clube bigint) returns text language sql stable set search_path = public as $$
  select coalesce(c.estadio_visual->>'cidade', (array['centro', 'bairro', 'rio', 'lago', 'litoral'])[abs(c.id) % 5 + 1]) from clubes c where c.id = p_clube $$;
insert into ligas values (1, 14);
-- 1: nível 2 no Tradicional (ganha) · 2: nível 2 na Arena (não) · 3: nível 1 em obra para o 2 sem troca (ganha) · 4: nível 1 (não) · 5: sem dono (não)
insert into clubes values (1, 1, gen_random_uuid(), 2, 1, 1, 1, 1, '{"nomeEstadio": "Velho"}'), (2, 1, gen_random_uuid(), 2, 1, 1, 1, 1, '{"modelo": "arena"}'),
  (3, 1, gen_random_uuid(), 1, 1, 1, 1, 1, null), (4, 1, gen_random_uuid(), 1, 1, 1, 1, 1, null), (5, 1, null, 2, 1, 1, 1, 1, null);
insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes) values (3, 'estadio', 2, 1500, 1, 1);
insert into financas select id, 100000 from clubes;
select set_config('teste.clube', '1', false);
`);
await db.exec(fs.readFileSync(new URL("../supabase/154_troca_do_estadio_na_ampliacao.sql", import.meta.url), "utf8"));
const sql = fs.readFileSync(new URL("../supabase/179_troca_livre_do_estadio.sql", import.meta.url), "utf8");
await db.exec(sql);
const visual = async id => (await q(`select estadio_visual v from clubes where id = $1`, [id]))[0].v || {};
assert.deepEqual(await Promise.all([1, 2, 3, 4, 5].map(async id => !!(await visual(id)).troca_livre)), [true, false, true, false, false]);
assert.equal((await visual(1)).nomeEstadio, "Velho");

// troca modelo e cidade na hora, de graça, e só uma vez
const outra = (await q(`select cidade_do_estadio(1) c`))[0].c === "rio" ? "lago" : "rio";
await q(`select reformar_estadio('inflavel', $1)`, [outra]);
const v = await visual(1);
assert.equal(v.modelo, "inflavel"); assert.equal(v.cidade, outra); assert.ok(!v.troca_livre && v.troca_livre_dada);
assert.equal((await q(`select caixa from financas where clube_id = 1`))[0].caixa, 100000);
assert.equal((await q(`select count(*)::int n from obras where clube_id = 1`))[0].n, 0);
await assert.rejects(q(`select reformar_estadio('arena')`), /só sai junto com uma ampliação/);

// rodar de novo não dá outra troca (nem a quem voltou ao Tradicional)
await q(`update clubes set estadio_visual = estadio_visual || '{"modelo": "tradicional"}' where id = 1`);
await db.exec(sql);
assert.ok(!(await visual(1)).troca_livre);

// só a cidade também vale
await q(`select set_config('teste.clube', '3', false)`);
await q(`select reformar_estadio(null, 'litoral')`);
assert.equal((await visual(3)).cidade, "litoral"); assert.ok(!(await visual(3)).troca_livre);

console.log("troca livre do estádio: ok");
