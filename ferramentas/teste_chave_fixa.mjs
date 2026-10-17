// Testa o supabase/103_chave_fixa.sql num Postgres em memória (PGlite), com tabelas mínimas.
// Uso: npm i --no-save @electric-sql/pglite@0.2.17 && node ferramentas/teste_chave_fixa.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
await db.exec(`
create schema auth; create function auth.role() returns text language sql as $$ select 'service_role' $$;
create function public.eh_admin() returns boolean language sql as $$ select false $$;
create table ligas (id bigint primary key, temporada int, copa jsonb, fundo_taca int default 0);
create table clubes (id bigint primary key, liga_id bigint, pais text default 'Brasil', estadio_nivel int default 1);
create table partidas (id serial primary key, liga_id bigint, grupo text, rodada int, fase text, copa_fase int, casa bigint, fora bigint, inicio timestamptz, fim timestamptz, processada boolean default false, vencedor bigint);
create table resultados (partida_id int, gols_casa int, gols_fora int, relatorio jsonb default '{}', efeitos jsonb);
create table base_jogos (id serial primary key, liga_id bigint, temporada int, grupo text, rodada int, casa bigint, fora bigint, inicio timestamptz, fase text, copinha_fase int, processada boolean default false, vencedor bigint);
create table base_campeoes (liga_id bigint, temporada int, grupo text, clube_id bigint, primary key (liga_id, temporada, grupo));
create table financas (clube_id bigint, caixa int default 0);
create table lancamentos (clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text);
create function public.montar_libertadores_juvenil(p_liga bigint) returns int language plpgsql as $f$
declare k int; begin for k in 1..8 loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase)
      values (p_liga, 1, 'LIBJ', 203, k, 100 + k, now(), 'libjuv', 3);
  end loop; return 8; end $f$;
insert into clubes (id, liga_id) select g, 1 from generate_series(1, 50) g;
insert into financas (clube_id) select g from generate_series(1, 50) g;
`);
await db.exec(fs.readFileSync(new URL('../supabase/103_chave_fixa.sql', import.meta.url), 'utf8'));
let falhas = 0;
const ok = (cond, nome) => { if (!cond) falhas++; console.log(cond ? 'ok  ' : 'FALHA', nome); };
const q = async (sql, p) => (await db.query(sql, p)).rows;
const datas = JSON.stringify([1, 2, 3, 4, 5, 6].map(k => ({ inicio: '2020-01-0' + k, fim: '2020-01-0' + k })));
// jogos da fase f já jogados: o mandante vence
const jogar = async (fase, tabela = 'partidas') => {
  if (tabela === 'partidas') { await db.exec(`update partidas set processada = true where copa_fase = ${fase}; insert into resultados (partida_id, gols_casa, gols_fora) select id, 1, 0 from partidas where copa_fase = ${fase} and fase = 'copa';`); }
  else await db.exec(`update base_jogos set processada = true, vencedor = casa where copinha_fase = ${fase};`);
};

// ---------- Copa com chave fixa: preliminar 15..50 (18 jogos), diretos 1..14, 32 vagas sorteadas no início
const vagas = [...Array.from({ length: 18 }, (_, k) => -(k + 1)), ...Array.from({ length: 14 }, (_, k) => k + 1)].sort(() => Math.random() - 0.5);
await db.query(`insert into ligas values (1, 1, $1::jsonb)`, [JSON.stringify({ datas: JSON.parse(datas), diretos: Array.from({ length: 14 }, (_, k) => k + 1), chave32: vagas })]);
for (let k = 1; k <= 18; k++) await db.query(`insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, chave) values (1, 'COPA', 101, 'copa', 1, $1, $2, $3)`, [13 + 2 * k, 14 + 2 * k, k]);
await jogar(1);
ok((await q(`select copa_sortear(1) n`))[0].n === 16, 'fase de 32: 16 jogos');
const quem = v => v < 0 ? 13 + 2 * -v : v; // vencedor do jogo k da preliminar = mandante (13 + 2k)
const f2 = await q(`select casa, fora, chave from partidas where copa_fase = 2 order by chave`);
ok(f2.every((p, i) => p.chave === i + 1 && new Set([p.casa, p.fora]).size === 2 && [quem(vagas[2 * i]), quem(vagas[2 * i + 1])].sort().join() === [p.casa, p.fora].map(Number).sort().join()), 'cada jogo da fase de 32 junta as vagas 2k-1 e 2k da chave sorteada');
await jogar(2);
await q(`select copa_sortear(1)`);
const f3 = await q(`select casa, fora, chave from partidas where copa_fase = 3 order by chave`);
const venc2 = f2.map(p => Number(p.casa));
ok(f3.length === 8 && f3.every((p, i) => [venc2[2 * i], venc2[2 * i + 1]].sort().join() === [p.casa, p.fora].map(Number).sort().join()), 'oitavas: vencedores dos jogos 1 e 2, 3 e 4… da fase de 32');

// ---------- Copa sem chave (temporada antiga): continua sorteando, e os jogos novos ficam sem chave
await db.exec(`delete from resultados; delete from partidas;`);
await db.query(`update ligas set copa = $1::jsonb where id = 1`, [JSON.stringify({ datas: JSON.parse(datas), diretos: Array.from({ length: 14 }, (_, k) => k + 1) })]);
for (let k = 1; k <= 18; k++) await db.query(`insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora) values (1, 'COPA', 101, 'copa', 1, $1, $2)`, [13 + 2 * k, 14 + 2 * k]);
await jogar(1);
ok((await q(`select copa_sortear(1) n`))[0].n === 16, 'sem chave: fase de 32 sorteada como antes');
ok((await q(`select count(*)::int c from partidas where copa_fase = 2 and chave is null`))[0].c === 16, 'sem chave: jogos novos continuam sem chave');

// ---------- Copinha: montar_copinha guarda a chave inteira; o avanço segue por ela
await db.exec(`update ligas set temporada = 1;`);
ok((await q(`select montar_copinha(1) n`))[0].n === 18, 'Copinha: 18 jogos na preliminar');
const cop = (await q(`select copa from ligas where id = 1`))[0].copa;
ok(Array.isArray(cop.copinha_chave32) && cop.copinha_chave32.length === 32, 'Copinha: 32 vagas guardadas');
ok((await q(`select count(*)::int c from base_jogos where fase = 'copinha' and chave is not null`))[0].c === 18, 'Copinha: preliminar com posições');
await jogar(1, 'base');
await q(`select copinha_avancar(1)`);
const prel = Object.fromEntries((await q(`select chave, casa from base_jogos where copinha_fase = 1`)).map(p => [p.chave, Number(p.casa)]));
const c2 = await q(`select casa, fora, chave from base_jogos where copinha_fase = 2 order by chave`), qc = v => v < 0 ? prel[-v] : v;
ok(c2.length === 16 && c2.every((p, i) => [qc(cop.copinha_chave32[2 * i]), qc(cop.copinha_chave32[2 * i + 1])].sort().join() === [p.casa, p.fora].map(Number).sort().join()), 'Copinha: fase de 32 pela chave');

// ---------- Libertadores Juvenil: oitavas com posição e quartas pela chave
await q(`select montar_libertadores_juvenil(1)`);
ok((await q(`select count(*)::int c from base_jogos where fase = 'libjuv' and chave between 1 and 8`))[0].c === 8, 'Lib. Juvenil: oitavas com posição 1 a 8');
await jogar(3, 'base');
await q(`select libertadores_juvenil_avancar(1)`);
const lj = await q(`select casa, fora from base_jogos where fase = 'libjuv' and copinha_fase = 4 order by chave`);
ok(lj.length === 4 && lj.every((p, i) => Number(p.casa) === 2 * i + 1 && Number(p.fora) === 2 * i + 2), 'Lib. Juvenil: quartas = vencedores 1x2, 3x4, 5x6, 7x8');

console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
