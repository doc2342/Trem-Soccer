// Confere o supabase/160_escolinha_do_dirigente_novo.sql num Postgres em memória (PGlite): o remendo no decidir_pedido grava o da escolinha
// e o juvenil comum (só o comum com formador) e o arquivo roda duas vezes. O decidir_pedido aqui é só o laço do insert, como está no ar.
// Uso: node ferramentas/teste_escolinha_do_novato_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const ler = f => fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
create table clubes (id bigint primary key);
create table jogadores (id bigserial primary key, clube_id bigint, nome text, nome_completo text, pais text, idade smallint, pos text, fam jsonb, at smallint[], pe text,
  principal boolean, salario int, salario_mercado int, contrato_ate int, protegido_ate int, juvenil boolean, escolinha boolean, formador bigint);
create table jogadores_ocultos (jogador_id bigint, tal smallint);
insert into clubes values (7);
create function decidir_pedido(p_id bigint, p_aprovar boolean, p_motivo text default null, p_clube bigint default null, p_elenco jsonb default null) returns bigint
language plpgsql as $$
declare v_c clubes%rowtype; v_id bigint; r record;
begin
  select * into v_c from clubes where id = p_clube;
  for r in select value as v from jsonb_array_elements(p_elenco) loop
    insert into jogadores (clube_id, nome, nome_completo, pais, idade, pos, fam, at, pe, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values (v_c.id, r.v->>'nome', r.v->>'nome_completo', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), r.v->>'pe', coalesce((r.v->>'principal')::boolean, false),
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
  end loop;
  return v_c.id;
end $$;
`);
await db.exec(ler("160_escolinha_do_dirigente_novo.sql"));
await db.exec(ler("160_escolinha_do_dirigente_novo.sql")); // roda duas vezes

const j = (nome, extra) => ({ nome, idade: 16, pos: "MC", fam: { MC: "N" }, at: [10], tal: 10, salario_mercado: 50, protegido_ate: 5, ...extra });
const elenco = [j("adulto", { idade: 25, salario: 300, contrato_ate: 1 }), j("garoto", { juvenil: true, escolinha: true }), j("talento", { juvenil: true, escolinha: false })];
await q("select decidir_pedido(1, true, null, 7, $1)", [JSON.stringify(elenco)]);
const por = Object.fromEntries((await q("select nome, juvenil, escolinha, formador from jogadores")).map(r => [r.nome, r]));
assert.deepStrictEqual([por.adulto.juvenil, por.adulto.escolinha, por.adulto.formador], [false, false, null]);
assert.deepStrictEqual([por.garoto.juvenil, por.garoto.escolinha, por.garoto.formador], [true, true, null]);
assert.deepStrictEqual([por.talento.juvenil, por.talento.escolinha, Number(por.talento.formador)], [true, false, 7]);
console.log("escolinha do dirigente novo (SQL 160): ok");
