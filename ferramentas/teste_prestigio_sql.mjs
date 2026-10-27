// Confere o supabase/159_prestigio_de_quem_sobe.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_prestigio_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create function eh_admin() returns boolean language sql as $$ select true $$;
create schema if not exists auth; create function auth.role() returns text language sql as $$ select 'authenticated' $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, torcida_fator numeric, torcida_fator_temporada int);
create table historico (liga_id bigint, temporada int, clube_id bigint, divisao int, posicao int, destino text, copa text);
insert into ligas values (1, 1);
insert into clubes (id, torcida_fator) select g, 1.5 from generate_series(1, 4) g;
insert into historico values (1, 0, 1, 2, 3, 'subiu', null),  -- T0: subiu sem ser o 1º
                             (1, 0, 2, 2, 1, 'ficou', null),  -- 1º que não subiu
                             (1, 0, 3, 2, 5, 'campeão', null), -- venceu a final
                             (1, 0, 4, 1, 1, 'campeão', null); -- campeão da A
`);
const sql = fs.readFileSync(new URL("../supabase/159_prestigio_de_quem_sobe.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes
await q(`select atualizar_torcidas(1)`);
const f = Object.fromEntries((await q(`select id, torcida_fator::float f from clubes`)).map(r => [r.id, +r.f.toFixed(2)]));
assert.deepStrictEqual(f, { 1: 1.53, 2: 1.48, 3: 1.53, 4: 1.63 });
await q(`select atualizar_torcidas(1)`); // a segunda chamada na mesma temporada não soma de novo
assert.equal(+(await q(`select torcida_fator::float f from clubes where id = 1`))[0].f.toFixed(2), 1.53);
console.log("159 prestígio: ok");
