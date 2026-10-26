// Confere o supabase/154_troca_do_estadio_na_ampliacao.sql num Postgres em memória (PGlite). Uso: node ferramentas/teste_troca_do_estadio_sql.mjs
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
  select case when p_estrutura = 'estadio' then (array[null, 1500, 3000, 5000, 8000, 12000, 20000, 30000])[p_nivel]
              else (array[250, 500, 1000, 2000, 4000])[p_nivel] end $$;
create function prazo_da_obra(p_nivel int) returns int language sql immutable as $$ select (array[1, 3, 6, 11, 18, 22, 27, 36])[p_nivel] $$;
create function cidade_do_estadio(p_clube bigint) returns text language sql stable set search_path = public as $$
  select coalesce(c.estadio_visual->>'cidade', (array['centro', 'bairro', 'rio', 'lago', 'litoral'])[abs(c.id) % 5 + 1]) from clubes c where c.id = p_clube $$;
insert into ligas values (1, 14);
insert into clubes values (1, 1, gen_random_uuid(), 1, 1, 1, 1, 1, null), (9, 1, gen_random_uuid(), 3, 1, 1, 1, 1, '{"reforma_gratis": true, "cidade_trocada": true, "nomeEstadio": "Velho"}');
insert into financas values (1, 100000), (9, 100000);
select set_config('teste.clube', '1', false);
`);
await db.exec(fs.readFileSync(new URL("../supabase/120_estadio_gratis_para_clube_novo.sql", import.meta.url), "utf8"));
const sql = fs.readFileSync(new URL("../supabase/154_troca_do_estadio_na_ampliacao.sql", import.meta.url), "utf8");
await db.exec(sql); await db.exec(sql); // rodar duas vezes

// limpeza
assert.deepEqual((await q(`select estadio_visual v from clubes where id = 9`))[0].v, { nomeEstadio: "Velho" });
assert.equal((await q(`select count(*)::int n from pg_trigger where tgname = 'estadio_gratis_para_dono_novo'`))[0].n, 0);
assert.equal((await q(`select count(*)::int n from pg_proc where proname = 'estadio_gratis_para_dono_novo'`))[0].n, 0);

const prepara = async (nivel, caixa = 100000, visual = null) => {
  await db.exec(`delete from obras; delete from lancamentos`);
  await q(`update clubes set estadio_nivel = $1, estadio_visual = $2 where id = 1`, [nivel, visual]);
  await q(`update financas set caixa = $1 where clube_id = 1`, [caixa]);
};
const caixa = async () => (await q(`select caixa from financas where clube_id = 1`))[0].caixa;
const obra = async () => (await q(`select * from obras`))[0];
const visual = async () => (await q(`select estadio_visual v from clubes where id = 1`))[0].v || {};
const atual = (await q(`select cidade_do_estadio(1) c`))[0].c; // sorteada pelo id: bairro
const outra = atual === "rio" ? "lago" : "rio";

// primeira_ampliacao_gratis
await prepara(1);
await q(`select iniciar_obra('estadio', 'arena', 'rio')`);
assert.equal(await caixa(), 100000 - 1500);
assert.equal((await obra()).custo, 1500);
assert.equal((await visual()).modelo_alvo, "arena"); assert.equal((await visual()).cidade_alvo, "rio");
// conclusao_aplica_modelo_e_cidade
await q(`update obras set concluida = true`);
const v1 = await visual();
assert.equal(v1.modelo, "arena"); assert.equal(v1.cidade, "rio");
assert.ok(!("modelo_alvo" in v1) && !("cidade_alvo" in v1));

// segunda_com_taxa
await prepara(2);
await q(`select iniciar_obra('estadio', 'dunas', null)`);
assert.equal(await caixa(), 100000 - 4500);
assert.equal((await obra()).custo, 4500);
assert.match((await q(`select descricao from lancamentos`))[0].descricao, /nível 3 \+ troca de modelo\/cidade/);

// sem_mudanca_preco_normal
await prepara(2, 100000, { modelo: "caldeirao" });
await q(`select iniciar_obra('estadio', 'caldeirao', cidade_do_estadio(1))`);
assert.equal(await caixa(), 100000 - 3000);
const v2 = await visual();
assert.ok(!("modelo_alvo" in v2) && !("cidade_alvo" in v2));

// so_cidade_cobra_uma_taxa
await prepara(3);
await q(`select iniciar_obra('estadio', 'tradicional', $1)`, [outra]);
assert.equal(await caixa(), 100000 - 7500);
const v3 = await visual();
assert.equal(v3.cidade_alvo, outra); assert.ok(!("modelo_alvo" in v3));

// caixa_sem_taxa_falha_inteiro
await prepara(3, 6000);
await assert.rejects(q(`select iniciar_obra('estadio', 'arena', null)`), /7500/);
assert.equal(await caixa(), 6000);
assert.equal((await q(`select count(*)::int n from obras`))[0].n, 0);

// outras estruturas não aceitam modelo/cidade
await prepara(3);
await assert.rejects(q(`select iniciar_obra('ct', 'arena', null)`), /só valem para o estádio/);
await q(`select iniciar_obra('ct')`); // chamada antiga, sem troca
assert.equal(await caixa(), 100000 - 500);

// modelo_desconhecido
await prepara(2);
await assert.rejects(q(`select iniciar_obra('estadio', 'castelo', null)`), /Modelo desconhecido/);
await assert.rejects(q(`select iniciar_obra('estadio', null, 'deserto')`), /Cidade desconhecida/);

// nivel8_quinze_mi
await prepara(8);
await q(`select reformar_estadio('wembley', 'lago')`);
assert.equal(await caixa(), 100000 - 15000);
const o8 = await obra();
assert.equal(o8.estrutura, "estadio_modelo"); assert.equal(o8.rodadas_total, 18);
assert.deepEqual([(await visual()).modelo_alvo, (await visual()).cidade_alvo], ["wembley", "lago"]);
await q(`update obras set concluida = true`);
assert.deepEqual([(await visual()).modelo, (await visual()).cidade], ["wembley", "lago"]);
await prepara(8, 100000, { modelo: "arena" });
await assert.rejects(q(`select reformar_estadio('arena', cidade_do_estadio(1))`), /já é desse modelo/);

// nivel8_so_no_maximo
await prepara(5);
await assert.rejects(q(`select reformar_estadio('arena')`), /só sai junto com uma ampliação/);
assert.equal(await caixa(), 100000);

// gratis_de_estadio_novo_em_qualquer_nivel
await prepara(3, 100000, { reforma_gratis_para: ["maracana"] });
await q(`select reformar_estadio('maracana')`);
assert.equal((await visual()).modelo, "maracana");
assert.ok(!("reforma_gratis_para" in (await visual())));
assert.equal(await caixa(), 100000);
await prepara(3, 100000, { reforma_gratis_para: "inflavel" }); // texto antigo do 127
await q(`select reformar_estadio('inflavel')`);
assert.equal((await visual()).modelo, "inflavel");

// liberar_troca_gratis soma à lista (versão do 128)
await prepara(3, 100000, { reforma_gratis_para: ["sansiro"] });
await q(`select liberar_troca_gratis('wembley')`);
assert.deepEqual((await visual()).reforma_gratis_para, ["sansiro", "wembley"]);

// cidade_fora_da_ampliacao
await prepara(3);
await assert.rejects(q(`select salvar_estadio_visual('{"cidade":"lago"}')`), /só muda numa ampliação/);
await q(`select salvar_estadio_visual('{"nomeEstadio":"X"}')`);
assert.equal((await visual()).nomeEstadio, "X");
await q(`select salvar_estadio_visual($1)`, [JSON.stringify({ cidade: atual })]); // a cidade atual não é mudança

console.log("troca do estádio: ok");
