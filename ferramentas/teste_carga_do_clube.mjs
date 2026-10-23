// Testa o supabase/107_carga_do_clube.sql (com o 142 por cima) num Postgres em memória (PGlite), com tabelas mínimas: todas as partes voltam,
// as regras de leitura (RLS) valem para quem chama, e uma parte que falha some sozinha, sem derrubar as outras.
// Uso: npm i --no-save @electric-sql/pglite@0.2.17 && node ferramentas/teste_carga_do_clube.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const U = '00000000-0000-0000-0000-00000000000a', V = '00000000-0000-0000-0000-00000000000b';
await db.exec(`
create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function public.eh_admin() returns boolean language sql stable as $$ select current_setting('t.admin', true) = 'sim' $$;
create table ligas (id bigint primary key, temporada int);
create table clubes (id bigint primary key, liga_id bigint, grupo text, dono uuid, dirigente text, nome text, sigla text, escudo jsonb, uniforme jsonb, perfil text, assumido_em timestamptz, ultimo_acesso timestamptz, extra boolean);
create table jogadores (id bigint primary key, clube_id bigint, nome text, pais text, idade int, pos text, fam jsonb, at int[], exp numeric, pe text, salario int, salario_mercado int, contrato_ate int,
  livre_ate timestamptz, oferta_liga_ate timestamptz, livre_inicio timestamptz, livre_abriu timestamptz, livre_liga bigint, emprestado_de bigint, formador bigint);
create table taticas (clube_id bigint, dados jsonb, atualizada_em timestamptz);
create table lancamentos (id bigint, clube_id bigint, temporada int, rodada int, tipo text, valor int, descricao text, criado_em timestamptz);
create table treinadores (id bigint, clube_id bigint, contratado boolean, nome text);
create table financas (clube_id bigint, caixa int);
create table obras (clube_id bigint, estrutura text, concluida boolean);
create table transferencias (id bigint, liga_id bigint, de_clube bigint, para_clube bigint, valor int);
create table propostas (id bigint, jogador_id bigint, comprador bigint, vendedor bigint);
create table ofertas_livres (jogador_id bigint, clube_id bigint, salario int, temporadas int, criada_em timestamptz);
create table relatorios (jogador_id bigint, nivel int, minimo int, maximo int);
create table pre_contratos (jogador_id bigint, clube_id bigint, temporada int, salario int, temporadas int);
create table base_jogos (id bigint, liga_id bigint, temporada int, grupo text, fase text, rodada int, copinha_fase int, casa bigint, fora bigint, inicio timestamptz, processada boolean,
  gols_casa int, gols_fora int, vencedor bigint, dados jsonb, chave int);
create table base_campeoes (liga_id bigint, temporada int, grupo text, clube_id bigint);
create table premios_individuais (liga_id bigint, temporada int, comp text, premio text, jogador_id bigint, jogador text, pos text, clube_id bigint, numero numeric);
create table revelados (id bigint, clube_id bigint, temporada int, origem text, jogador_id bigint, nome text, pos text, idade int, at int[]);
create table taticas_base (clube_id bigint, dados jsonb, atualizada_em timestamptz);
create table safras (liga_id bigint, temporada int, clube_id bigint, jogador text, pos text, idade int, nivel int);
create table partidas (id bigint, liga_id bigint, grupo text, rodada int, fase text, copa_fase int, casa bigint, fora bigint, inicio timestamptz, fim timestamptz, processada boolean, vencedor bigint, chave int);
create table resultados (partida_id bigint, gols_casa int, gols_fora int, xg_casa numeric, xg_fora numeric, pts_esp_casa numeric, pts_esp_fora numeric, libera_em timestamptz, relatorio jsonb);
create table historico (liga_id bigint, temporada int, clube_id bigint, grupo text, divisao int, posicao int, pontos int, destino text, copa text, supercopa boolean, lib text);
create table historico_lances (clube_id bigint, jogador_id bigint, salario int, temporadas int, criada_em timestamptz);
create table metas (liga_id bigint, temporada int, clube_id bigint, grupo text, faixa_min int, faixa_max int);
create table confianca_historico (liga_id bigint, temporada int, clube_id bigint, antes int, depois int, detalhes jsonb, verba int);
create table dirigentes (user_id uuid primary key, direitos smallint not null default 0);
create table pedidos_extra (user_id uuid, estado text);
create table leiloes_fechados (n int);
create function resolver_leiloes(p_liga bigint) returns int language sql as $$ insert into leiloes_fechados values (1) returning 1 $$;
create function janela_do_mercado(p_liga bigint) returns text language sql stable as $$ select 'aberta' $$;
create function relatorio_do_elenco() returns table (jogador_id bigint, minimo int, maximo int) language sql stable as $$ select 1::bigint, 60, 80 $$;
create function periodo_de_pre_acordo(p_liga bigint) returns boolean language sql stable as $$ select false $$;
create function cotacao_do_agente(p_liga bigint) returns numeric language sql stable as $$ select 0.85 $$;
create function rodadas_completas(p_liga bigint) returns int language sql stable as $$ select 7 $$;
create function estatisticas_da_liga(p_liga bigint, p_comp text default 'TODOS') returns jsonb language sql stable as $$ select '{"artilheiros":[]}'::jsonb $$;
create function registrar_acesso() returns void language sql security definer as $$ update clubes set ultimo_acesso = now() where dono = auth.uid() $$;
create function ultima_novidade(p_liga bigint, p_clube bigint) returns timestamptz language sql stable as $$ select '2026-10-23 12:00Z'::timestamptz $$;
create function propostas_patrocinio() returns jsonb language sql stable as $$ select '{"temporada":3,"propostas":[]}'::jsonb $$;

insert into ligas values (1, 3);
insert into clubes values (10,1,'A','${U}','Luiz','Trem','TRE','{}','{}','equilibrado',now(),now(),false), (11,1,'A','${V}','Ana','Vaca','VAC','{}','{}','equilibrado',now(),now(),false), (12,1,'B',null,null,'Bot','BOT','{}','{}','ofensivo',null,null,false);
insert into jogadores (id, clube_id, nome, idade, pos, at) values (1,10,'Zé',22,'GOL','{50,60}'), (2,10,'Tico',30,'ZAG','{70}'), (3,11,'Outro',25,'ATA','{80}');
insert into jogadores (id, clube_id, nome, idade, pos, livre_liga, livre_ate) values (4,null,'Livre',28,'MEI',1,now() + interval '1 day');
insert into ofertas_livres values (4,10,90,2,now());
insert into financas values (10, 5000), (11, 7000);
insert into obras values (10, 'ct', false);
insert into taticas values (10, '{"vagas":[]}', now());
insert into lancamentos values (1,10,3,1,'tv',100,'TV',now());
insert into treinadores values (1,10,true,'Prof'), (2,10,false,'Candidato');
insert into transferencias values (1,1,10,12,500), (2,1,11,12,300);
insert into propostas values (1,3,10,11);
insert into relatorios values (3,1,60,90);
insert into pre_contratos values (3,10,4,100,2);
insert into base_jogos values (1,1,3,'A','liga',1,null,10,11,now(),true,1,0,null,'{"jogadores":[]}',null), (2,1,3,'COPINHA','copinha',null,2,10,12,now(),true,1,1,10,'{"penaltis":[4,3]}',1), (3,1,3,'B','liga',1,null,12,12,now(),false,null,null,null,null,null);
insert into base_campeoes values (1,2,'A',10);
insert into premios_individuais values (1,2,'A','artilheiro',1,'Zé','GOL',10,1);
insert into revelados values (1,10,2,'peneira',1,'Zé','GOL',17,'{40}');
insert into safras values (1,3,10,'Zé','GOL',17,3);
insert into partidas values (100,1,'A',1,'liga',null,10,11,now() - interval '2 days',now(),true,null,null), (101,1,'A',2,'liga',null,11,10,now() + interval '2 days',null,false,null,null),
  (102,1,'COPA',null,'copa',2,10,12,now() - interval '1 day',now(),true,10,1), (103,1,'B',1,'liga',null,12,12,now(),null,false,null,null);
insert into resultados values (100,2,1,1.5,0.8,2.1,0.6,now() - interval '1 day','{}'), (102,1,1,1,1,1,1,now() - interval '1 hour','{"penaltis":[5,4],"vencedor":10}'), (103,0,0,0,0,0,0,now(),'{}');
insert into historico values (1,2,10,'A',1,1,40,'ficou',null,false,null), (1,2,11,'A',1,2,38,'ficou','campeão',false,null), (1,1,12,'B',2,5,20,'caiu',null,false,null);
insert into historico_lances values (10,4,90,2,now());
insert into metas values (1,3,10,'A',1,4);
insert into confianca_historico values (1,2,10,50,60,'{}',0);
insert into dirigentes values ('${U}', 1), ('${V}', 0);
insert into pedidos_extra values ('${U}', 'pendente'), ('${V}', 'recusado');
-- RLS em duas tabelas, para ver que a função roda com a permissão de quem chama
alter table financas enable row level security; create policy f on financas for select using (exists (select 1 from clubes c where c.id = clube_id and c.dono = auth.uid()) or eh_admin());
alter table dirigentes enable row level security; create policy d on dirigentes for select using (user_id = auth.uid() or eh_admin());
grant usage on schema public, auth to authenticated; grant select, insert on all tables in schema public to authenticated; grant execute on all functions in schema public, auth to authenticated;
`);
await db.exec(fs.readFileSync(new URL('../supabase/107_carga_do_clube.sql', import.meta.url), 'utf8'));
await db.exec(fs.readFileSync(new URL('../supabase/107_carga_do_clube.sql', import.meta.url), 'utf8')); // pode rodar de novo
for (let i = 0; i < 2; i++) await db.exec(fs.readFileSync(new URL('../supabase/142_carga_traz_o_resto.sql', import.meta.url), 'utf8')); // o 142 também
await db.exec(`update clubes set ultimo_acesso = '2000-01-01' where id = 10`);
let falhas = 0;
const confere = (nome, ok) => { if (!ok) falhas++; console.log(ok ? 'ok  ' : 'FALHA', nome); };
const carga = async (uid, admin = 'nao', clube = 10) => {
  await db.exec(`select set_config('t.uid', '${uid}', false), set_config('t.admin', '${admin}', false); set role authenticated`);
  const r = (await db.query(`select carga_do_clube(1, ${clube}) as c`)).rows[0].c;
  await db.exec('reset role'); return r;
};
const CHAVES = ['elenco', 'clubes', 'tatica', 'admin', 'extrato', 'comissao', 'caixa', 'obra', 'janela', 'transferencias', 'propostas', 'livres', 'lancesLivres', 'ofertas', 'tetos', 'relatorios',
  'prePeriodo', 'preContratos', 'cotacao', 'base', 'baseCampeoes', 'premios', 'revelados', 'taticaBase', 'safra', 'rodadasFeitas', 'copa', 'meusJogos', 'partidasDoGrupo', 'resultados', 'trofeus',
  'meusLances', 'negocios', 'emprestados', 'metas', 'confianca', 'direitos', 'pedidoExtra', 'estatisticas', 'campanhas', 'acesso', 'novidade', 'patrocinio'];
let c = await carga(U);
const faltam = CHAVES.filter(k => !(k in c));
confere('todas as partes voltam' + (faltam.length ? ' (faltam: ' + faltam.join(', ') + ')' : ''), !faltam.length);
confere('leilões fechados antes das leituras', (await db.query('select count(*)::int n from leiloes_fechados')).rows[0].n === 1);
confere('elenco do clube, em ordem', c.elenco.map(j => j.id).join() === '1,2');
confere('caixa do próprio clube', c.caixa === 5000);
confere('comissão só com os contratados', c.comissao.length === 1);
confere('obra em andamento', c.obra && c.obra.estrutura === 'ct');
confere('propostas com o jogador embutido', c.propostas[0].jogadores.nome === 'Outro');
confere('lances dos livres da liga', c.lancesLivres.length === 1 && c.livres.length === 1);
confere('base: liga do grupo e Copinha, sem a liga de outro grupo', c.base.map(p => p.id).join() === '1,2');
confere('copa e calendário do clube', c.copa.length === 1 && c.meusJogos.map(p => p.id).join() === '100,102,101');
confere('partidas do grupo do clube', c.partidasDoGrupo.map(p => p.id).join() === '100,101');
confere('resultados da copa, do clube e do grupo (não os de outro grupo)', c.resultados.map(r => r.partida_id).sort().join() === '100,102');
confere('pênaltis e vencedor da copa', JSON.stringify(c.resultados.find(r => r.partida_id === 102).penaltis) === '[5,4]');
confere('troféus: 1º lugar e finalista da copa', c.trofeus.length === 2);
confere('campanhas da temporada passada', c.campanhas.length === 2);
confere('direitos do dirigente', c.direitos === 1);
confere('pedido extra do próprio dirigente', c.pedidoExtra && c.pedidoExtra.estado === 'pendente');
confere('cotação numérica', +c.cotacao === 0.85);
confere('142: acesso registrado', c.acesso === true && (await db.query(`select ultimo_acesso > '2001-01-01' ok from clubes where id = 10`)).rows[0].ok);
confere('142: última novidade e patrocínio', new Date(c.novidade).getTime() === Date.parse('2026-10-23T12:00Z') && c.patrocinio.temporada === 3);
confere('142: o trecho entra uma vez só', (await db.query(`select (length(d) - length(replace(d, 'registrar_acesso', ''))) / 16 n from (select pg_get_functiondef('carga_do_clube(bigint,bigint)'::regprocedure) d) x`)).rows[0].n === 1);
confere('negócios do clube', c.negocios.length === 1 && c.transferencias.length === 2);
// RLS: o caixa de outro clube não aparece para quem não é dono; o administrador vê, e os direitos voltam nulos (como a leitura antiga)
c = await carga(V, 'nao', 10);
confere('caixa de outro clube: nulo para quem não é dono', c.caixa === null);
confere('direitos de quem chama (não os do dono do clube)', c.direitos === 0);
c = await carga(V, 'sim', 10);
confere('administrador vê o caixa', c.caixa === 5000);
confere('administrador: direitos nulos, como antes', c.direitos === null);
// uma parte que falha fica de fora, sem derrubar o resto
await db.exec('drop table revelados');
c = await carga(U);
confere('tabela que falta: só a chave dela some', !('revelados' in c) && 'elenco' in c && 'emprestados' in c);
console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
