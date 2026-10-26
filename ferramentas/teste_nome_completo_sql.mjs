// Confere o supabase/151_nome_completo.sql num Postgres em memória (PGlite): as cinco funções que gravam jogador gerado passam a gravar
// o nome_completo da lista, e o arquivo roda duas vezes. As funções são stubs com as mesmas linhas de insert da versão no ar.
// Uso: node ferramentas/teste_nome_completo_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const lista = `insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate)\r
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',\r
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,\r
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int);`;
const stub = nome => `create function ${nome}(p jsonb) returns void language plpgsql as $f$
declare r record;
begin
  for r in select value as v from jsonb_array_elements(p) loop
    ${lista}
    insert into jogadores_ocultos (jogador_id, tal) values (1, 50);
  end loop;
end $f$;`;
await db.exec(`
create table jogadores (id bigserial primary key, clube_id bigint, nome text, pais text, idade smallint, pos text, fam jsonb, at smallint[], principal boolean,
  salario int, salario_mercado int, contrato_ate int, protegido_ate int);
create table jogadores_ocultos (jogador_id bigint, tal smallint);
${["receber_jovens", "virar_temporada", "decidir_pedido", "aprovar_pedido_extra"].map(stub).join("\n")}
create function comprar_pela_multa(p_reposicao jsonb) returns void language plpgsql as $f$
begin
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, chegou_temporada)\r
      values (1, p_reposicao->>'nome', coalesce(p_reposicao->>'pais', 'Brasil'), (p_reposicao->>'idade')::smallint, p_reposicao->>'pos', p_reposicao->'fam',\r
        array(select jsonb_array_elements_text(p_reposicao->'at')::smallint), false,\r
        (p_reposicao->>'salario')::int, (p_reposicao->>'salario_mercado')::int, (p_reposicao->>'contrato_ate')::int, (p_reposicao->>'protegido_ate')::int, 1);
end $f$;
alter table jogadores add column chegou_temporada int;
`);
const sql = fs.readFileSync(new URL("../supabase/151_nome_completo.sql", import.meta.url), "utf8");
await db.exec(sql);
await db.exec(sql); // idempotente

const jog = { clube_id: 1, nome: "Bebeto", nome_completo: "Roberto Gama", idade: 18, pos: "FC", fam: { FC: "N" }, at: [10, 11], salario: 100, salario_mercado: 100 };
for (const f of ["receber_jovens", "virar_temporada", "decidir_pedido", "aprovar_pedido_extra", "comprar_pela_multa"]) {
  await q(`delete from jogadores`);
  await q(`select ${f}($1::jsonb)`, [JSON.stringify(f === "comprar_pela_multa" ? jog : [jog])]);
  assert.deepStrictEqual(await q(`select nome, nome_completo, pais from jogadores`), [{ nome: "Bebeto", nome_completo: "Roberto Gama", pais: "Brasil" }], f);
}
// sem nome_completo na lista (caminho antigo), fica vazio e nada quebra
await q(`delete from jogadores`); await q(`select receber_jovens($1::jsonb)`, [JSON.stringify([{ ...jog, nome_completo: undefined }])]);
assert.strictEqual((await q(`select nome_completo from jogadores`))[0].nome_completo, null);
console.log("nome completo (151): ok");
