// Confere o supabase/155_garotos_da_escolinha.sql num Postgres em memória (PGlite): o reinício grava o da escolinha e o juvenil comum
// (só o comum com formador), o da escolinha não assina contrato, não muda de clube nem vai à venda, a dispensa o tira da liga
// (a do juvenil comum continua deixando livre) e o arquivo roda duas vezes. Uso: node ferramentas/teste_escolinha_sql.mjs
import assert from "node:assert";
import fs from "node:fs";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); } catch { console.log("SQL: pulado (npm i --no-save @electric-sql/pglite@0.2.17)"); process.exit(0); }
const ler = f => fs.readFileSync(new URL("../supabase/" + f, import.meta.url), "utf8");
const db = new PGlite(), q = async (s, p) => (await db.query(s, p)).rows;
const DONO = "00000000-0000-0000-0000-000000000001";
await db.exec(`
set check_function_bodies = off;
create role anon; create role authenticated;
create schema auth; create function auth.uid() returns uuid language sql as $$ select '${DONO}'::uuid $$;
create function eh_admin() returns boolean language sql as $$ select true $$;
create function pais_do_grupo(g text) returns text language sql immutable as $$ select 'Brasil' $$;
create function multa_da_dispensa(p bigint) returns int language sql as $$ select 0 $$;
create table ligas (id bigint primary key, temporada int, pausada boolean, pausada_em timestamptz, fundo_taca int, temporada_fechada int, aposentadorias_em int,
  janela_inicio_fecha timestamptz, janela_meio_abre timestamptz, janela_meio_fecha timestamptz, copa jsonb, sedes jsonb);
create table clubes (id bigint primary key, liga_id bigint, grupo text, dono uuid, nome text, divisao int, estadio_nivel int, humor numeric, ct_nivel int, medico_nivel int, fisio_nivel int, base_nivel int,
  estadio_visual jsonb, paraquedas int, carne int, carne_temporada int, vermelho_rodadas int, premio_antecipado int, antecipou_temporada int, confianca int, segundo_clube boolean, multas_extra int,
  multas_extra_temporada int, candidatos_em timestamptz, peneira_temporada int, escudo_troca boolean, torcida_fator numeric, torcida_fator_temporada int, socios_auto boolean, torcida int);
create table divisoes (liga_id bigint, divisao int, torcida_base int);
create table financas (clube_id bigint primary key, caixa int);
create table jogadores (id bigserial primary key, clube_id bigint, livre_liga bigint, nome text, nome_completo text, pais text, idade smallint, pos text, fam jsonb, at smallint[], pe text,
  principal boolean, salario int, salario_mercado int, contrato_ate int, protegido_ate int, protegido boolean, a_venda boolean, juvenil boolean, formador bigint, pre_contrato jsonb,
  livre_ate timestamptz, livre_inicio timestamptz, livre_abriu timestamptz, chegou_temporada int, chegou_janela text, treino jsonb, dispensado_por bigint, dispensado_temporada int);
create table jogadores_ocultos (jogador_id bigint references jogadores on delete cascade, tal smallint);
create table partidas (id serial primary key, liga_id bigint, casa bigint, fora bigint, processada boolean, fim timestamptz);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
insert into ligas (id, temporada) values (1, 14);
insert into clubes (id, liga_id, grupo, dono, nome) values (1, 1, 'B', '${DONO}', 'Dono FC'), (2, 1, 'A', null, 'Bot FC');
`);
await db.exec(ler("149_reinicio_da_liga.sql"));
await db.exec(ler("155_garotos_da_escolinha.sql"));
await db.exec(ler("155_garotos_da_escolinha.sql")); // roda duas vezes
await db.exec(`create trigger guardas_da_base before update on jogadores for each row execute function guardas_da_base();`);

const j = (nome, extra = {}) => ({ clube_id: 1, nome, idade: 16, pos: "MC", fam: { MC: "N" }, at: [10], pe: "D", tal: 10, salario: null, salario_mercado: 50, contrato_ate: null, protegido_ate: 5, juvenil: true, ...extra });
const adultos = Array.from({ length: 17 }, (_, i) => j("adulto" + i, { idade: 25, salario: 300, contrato_ate: 1, juvenil: undefined, tal: 60 }));
await q(`select reiniciar_liga(1, '{"1":"B","2":"A"}'::jsonb, $1::jsonb)`, [JSON.stringify([...adultos, j("Esc", { escolinha: true }), j("Comum", { tal: 70 })])]);
const um = async nome => (await q(`select j.*, o.tal from jogadores j left join jogadores_ocultos o on o.jogador_id = j.id where nome = $1`, [nome]))[0];
const esc = await um("Esc"), comum = await um("Comum"), adulto = await um("adulto0");
assert.deepEqual([esc.juvenil, esc.escolinha, esc.formador, esc.salario, esc.tal], [true, true, null, null, 10]);
assert.deepEqual([comum.juvenil, comum.escolinha, comum.formador, comum.tal], [true, false, "1", 70]);
assert.deepEqual([adulto.juvenil, adulto.escolinha, adulto.formador], [false, false, null]);

// o da escolinha: nada de contrato, clube novo, venda ou proteção
for (const set of ["salario = 100, juvenil = false", "clube_id = 2", "a_venda = true", "protegido = true", "escolinha = false"])
  await assert.rejects(q(`update jogadores set ${set} where id = $1`, [esc.id]), /é da escolinha/, set);
await q(`update jogadores set treino = '{"x":1}', idade = 17 where id = $1`, [esc.id]); // treinar e envelhecer, pode
await q(`update jogadores set salario = 100, juvenil = false where id = $1`, [comum.id]); // o comum assina
await q(`update jogadores set salario = null, juvenil = true where id = $1`, [comum.id]);

// dispensa: o da escolinha sai da liga; o comum fica livre
assert.match((await q(`select dispensar_jogador($1) r`, [esc.id]))[0].r, /voltou para a escolinha/);
assert.equal(await um("Esc"), undefined);
assert.match((await q(`select dispensar_jogador($1) r`, [comum.id]))[0].r, /está livre/);
assert.deepEqual((await q(`select clube_id, livre_liga::int, juvenil from jogadores where nome = 'Comum'`))[0], { clube_id: null, livre_liga: 1, juvenil: false });
// peneira com os 25 cheios: cada jovem novo toma a vaga do mais fraco da escolinha
await db.exec(`create function meu_clube_de(u uuid) returns bigint language sql as $$ select 1::bigint $$;
  create function rodadas_completas(l bigint) returns int language sql as $$ select 9 $$;`);
await q(`delete from jogadores where juvenil`);
for (let i = 0; i < 25; i++) await q(`insert into jogadores (clube_id, nome, idade, at, juvenil, escolinha) values (1, $1, 16, $2, true, $3)`, ["J" + i, [i < 3 ? 1 + i : 50], i < 3]);
const novo = n => ({ nome: n, idade: 16, pos: "MC", fam: {}, at: [20], salario_mercado: 50, tal: 50 });
assert.match((await q(`select receber_jovens($1, $2::jsonb) r`, [DONO, JSON.stringify([novo("N1"), novo("N2")])]))[0].r, /revelou 2 juvenis\. 2 garotos da escolinha saíram/);
assert.deepEqual((await q(`select nome from jogadores where escolinha order by nome`)).map(x => x.nome), ["J2"], "saíram os dois mais fracos");
assert.equal((await q(`select count(*)::int n from jogadores where juvenil`))[0].n, 25);
await q(`update clubes set peneira_temporada = null`);
await q(`delete from jogadores where escolinha`);
await q(`insert into jogadores (clube_id, nome, idade, at, juvenil) values (1, 'J25', 16, '{50}', true)`); // de novo 25, nenhum da escolinha
assert.match((await q(`select receber_jovens($1, $2::jsonb) r`, [DONO, JSON.stringify([novo("N3")])]))[0].r, /não revelou ninguém\.$/, "sem escolinha, lotado continua lotado");
console.log("teste_escolinha_sql: ok");
