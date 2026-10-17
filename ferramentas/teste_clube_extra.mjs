// Testa o supabase/95_pedido_de_clube_extra.sql e o 96_seletor_de_clubes.sql num Postgres em memória (PGlite), com tabelas mínimas.
// Uso: npm i --no-save @electric-sql/pglite@0.2.17 && node ferramentas/teste_clube_extra.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const U = '00000000-0000-0000-0000-00000000000a';
await db.exec(`
create role authenticated; create role anon; create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function public.eh_admin() returns boolean language sql stable as $$ select current_setting('t.admin', true) = 'sim' $$;
insert into auth.users values ('${U}', 'a@x');
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, nome text, sigla text, escudo jsonb default '{}', uniforme jsonb default '{}', dono uuid, pais text, dirigente text,
  assumido_em timestamptz, ultimo_acesso timestamptz, confianca smallint default 50, segundo_clube boolean default false, multas_extra smallint default 0, multas_extra_temporada int,
  estadio_nivel smallint default 1, ct_nivel smallint default 0, medico_nivel smallint default 0, fisio_nivel smallint default 0, base_nivel smallint default 0, torcida int default 14000,
  humor numeric(4,1) default 8, torcida_fator numeric(4,2) default 1, torcida_fator_temporada int, carne int default 0, carne_temporada int, vermelho_rodadas smallint default 0,
  premio_antecipado int default 0, antecipou_temporada int, candidatos_em timestamptz, peneira_temporada int, escudo_troca boolean default false, paraquedas int);
create table jogadores (id bigint generated always as identity primary key, clube_id bigint references clubes on delete cascade, nome text, pais text, idade smallint, pos text, fam jsonb, at smallint[], pe text,
  principal boolean default false, salario int, salario_mercado int, contrato_ate int, protegido_ate int, emprestado_de bigint);
create table jogadores_ocultos (jogador_id bigint references jogadores on delete cascade, tal smallint);
create table propostas (jogador_id bigint references jogadores on delete cascade, comprador bigint, vendedor bigint, estado text);
create table pre_contratos (jogador_id bigint references jogadores on delete cascade, clube_id bigint);
create table taticas (clube_id bigint); create table obras (clube_id bigint); create table treinadores (clube_id bigint);
create table financas (clube_id bigint primary key, caixa int);
create table dirigentes (user_id uuid primary key, clube_ativo bigint, direitos smallint not null default 0, pode_pedir_desde int);
create table pedidos (nome text, estado text);
create function continente_do_pais(p text) returns text language sql immutable as $$ select 'América do Sul' $$;
insert into ligas values (1, 5);
insert into clubes (id, liga_id, grupo, nome, sigla, dono, pais, dirigente, ct_nivel, torcida) values
  (1,1,'A','Trem','TRE','${U}','Brasil','Luiz',3,30000),
  (2,1,'ARG','Bot A','BOA',null,'Argentina',null,2,20000),(3,1,'ARG','Bot B','BOB',null,'Argentina',null,4,22000),(4,1,'ARG','Bot C','BOC',null,'Argentina',null,0,18000),
  (5,1,'URU','Bot U','BOU',null,'Uruguai',null,1,10000);
insert into financas values (1,9000),(2,1000),(3,3000),(4,2000),(5,500);
`);
// cada bot com 3 jogadores; o primeiro de cada bot tem proposta de dirigente
for (const c of [2, 3, 4, 5]) for (let k = 0; k < 3; k++) await db.exec(`insert into jogadores (clube_id, nome, pais, idade, pos, fam, at) values (${c}, 'J${c}${k}', 'Argentina', 25, 'FC', '{}', array_fill(20::smallint, array[22]))`);
await db.exec(`insert into propostas (jogador_id, comprador, estado) select id, 1, 'pendente' from jogadores where nome like 'J_0'`);
await db.exec(fs.readFileSync(new URL('../supabase/95_pedido_de_clube_extra.sql', import.meta.url), 'utf8'));
let falhas = 0;
const como = (uid, admin) => db.exec(`select set_config('t.uid', '${uid}', false), set_config('t.admin', '${admin}', false)`);
async function caso(nome, sql, esperaErro, conferir) {
  let erro = null, r; try { r = await db.query(sql); } catch (e) { erro = e.message; }
  let ok = esperaErro ? !!erro : !erro;
  if (ok && conferir) { const c = await conferir(r); if (c !== true) { ok = false; erro = 'conferência: ' + c; } }
  if (!ok) falhas++;
  console.log(ok ? 'ok  ' : 'FALHA', nome, erro ? '→ ' + erro : '');
}
const pedir = (pais, nome = 'Rosário') => `select pedir_clube_extra('${pais}', '${nome}', 'ROS', '{}', '{}')`;
await como(U, 'nao');
await caso('sem direito, não pede', pedir('Argentina'), true);
await db.exec(`insert into dirigentes (user_id, direitos) values ('${U}', 1)`);
await caso('Brasil não vale', pedir('Brasil'), true);
await caso('nome repetido', pedir('Argentina', 'Bot B'), true);
await caso('sigla inválida', `select pedir_clube_extra('Argentina', 'Rosário', 'R', '{}', '{}')`, true);
await caso('pede Argentina', pedir('Argentina'), false);
await caso('pede de novo (troca pelo Uruguai)', pedir('Uruguai'), false, async () => (await db.query(`select pais from pedidos_extra`)).rows[0].pais === 'Uruguai' || 'país não trocou');
await caso('volta para a Argentina', pedir('Argentina'), false);
await caso('não-admin não aprova', `select aprovar_pedido_extra('${U}', '[]')`, true);
await como(U, 'sim');
await caso('elenco incompleto', `select aprovar_pedido_extra('${U}', '[]')`, true);
const elenco = JSON.stringify(Array.from({ length: 22 }, (_, i) => ({ nome: 'Novo' + i, pais: 'Argentina', idade: 24, pos: 'DC', fam: { DC: 'N' }, at: Array(22).fill(30), pe: 'D', principal: i < 16, tal: 12, salario: 300, salario_mercado: 300, contrato_ate: 6, protegido_ate: 5 })));
let id;
await caso('aprova', `select aprovar_pedido_extra('${U}', '${elenco}') as id`, false, r => { id = r.rows[0].id; return [2, 3, 4].includes(+id) || 'clube fora da Argentina: ' + id; });
await caso('clube refeito', `select c.* from clubes c where c.id = ${id}`, false, r => { const c = r.rows[0];
  return (c.dono === U && c.nome === 'Rosário' && c.dirigente === 'Luiz' && c.confianca === 50) || JSON.stringify(c); });
await caso('estruturas e caixa na média dos outros', `select c.ct_nivel, c.torcida, f.caixa, (select round(avg(ct_nivel)) from clubes where pais='Argentina' and id<>${id}) mct,
  (select round(avg(f2.caixa)) from financas f2 join clubes x on x.id=f2.clube_id where x.pais='Argentina' and x.id<>${id}) mcx from clubes c join financas f on f.clube_id=c.id where c.id=${id}`, false,
  r => { const x = r.rows[0]; return (x.ct_nivel == x.mct && x.caixa == x.mcx) || JSON.stringify(x); });
await caso('elenco: 22 novos + 1 em negociação, ocultos', `select count(*) filter (where nome like 'Novo%') novos, count(*) filter (where nome like 'J%') velhos, (select count(*) from jogadores_ocultos o join jogadores j on j.id=o.jogador_id where j.clube_id=${id}) oc from jogadores where clube_id=${id}`, false,
  r => { const x = r.rows[0]; return (x.novos == 22 && x.velhos == 1 && x.oc == 22) || JSON.stringify(x); });
await caso('direito gasto, pedido aprovado', `select d.direitos, p.estado, p.clube_id from dirigentes d, pedidos_extra p`, false, r => { const x = r.rows[0]; return (x.direitos == 0 && x.estado === 'aprovado' && x.clube_id == id) || JSON.stringify(x); });
await como(U, 'nao');
await caso('sem direito de novo', pedir('Uruguai', 'Outro'), true);
await db.exec(fs.readFileSync(new URL('../supabase/96_seletor_de_clubes.sql', import.meta.url), 'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/96_seletor_de_clubes.sql', import.meta.url), 'utf8')); // rodar duas vezes
await caso('aprovado vira extra (pelo update do 96)', `select extra from clubes where id = ${id}`, false, r => r.rows[0].extra === true || 'extra = ' + r.rows[0].extra);
await caso('aprovar_pedido_extra agora marca extra', `select prosrc like '%extra = true%' ok from pg_proc where proname = 'aprovar_pedido_extra'`, false, r => r.rows[0].ok || 'sem marca');
await como(U, 'nao');
await caso('ativar clube alheio', `select ativar_clube(5)`, true);
await caso('ativar o extra', `select ativar_clube(${id})`, false, async () => (await db.query(`select clube_ativo from dirigentes`)).rows[0].clube_ativo == id || 'não ativou');
await db.exec(`insert into propostas (jogador_id, comprador, vendedor, estado) select id, 5, ${id}, 'pendente' from jogadores where clube_id = ${id} limit 2; insert into taticas values (1);`);
await caso('pendências', `select * from minhas_pendencias() order by clube_id`, false, r => { const m = Object.fromEntries(r.rows.map(x => [x.clube_id, x.n]));
  return (m[1] === 0 && m[id] === 3) || JSON.stringify(m); });
console.log(falhas ? falhas + ' FALHAS' : 'tudo certo');
