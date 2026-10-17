-- 107: a página do clube (jogo.html) lê tudo numa chamada só, para gastar menos log.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não exige republicar função.
-- Pode ser executado mais de uma vez. Antes dele, a página lê do jeito antigo (umas 40 leituras por carga).
--
-- Cada abertura da página fazia ~40 leituras separadas (e um OPTIONS para cada uma), umas 80 linhas de log em poucos segundos.
-- Esta função faz as mesmas leituras dentro do banco e devolve um jsonb só. Roda com a permissão de quem chama (security invoker):
-- as regras de leitura (RLS) valem igual a antes, e cada um continua vendo só o que já via.
-- Cada parte tem a sua guarda: se uma falhar, a chave dela fica de fora e a página usa o mesmo valor de quando a leitura falhava.
-- Não muda regra de jogo: só o resolver_leiloes grava, e ele já rodava em toda carga da página antes das leituras do mercado.

create or replace function public.carga_do_clube(p_liga bigint, p_clube bigint) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  r jsonb := '{}';
  v_temp int;
  v_grupo text;
  v_ids bigint[];
begin
  select temporada into v_temp from ligas where id = p_liga;
  select grupo into v_grupo from clubes where id = p_clube;

  -- mercado: os leilões e ofertas vencidos fecham antes das leituras (como antes, na página)
  begin perform resolver_leiloes(p_liga); exception when others then null; end;

  -- elenco, clubes, tática, administrador, extrato, comissão técnica
  begin r := r || jsonb_build_object('elenco', (select coalesce(jsonb_agg(to_jsonb(j)), '[]') from (select * from jogadores where clube_id = p_clube order by id) j)); exception when others then null; end;
  begin r := r || jsonb_build_object('clubes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from (select id, grupo, dono, dirigente, nome, sigla, escudo, uniforme, perfil, assumido_em, ultimo_acesso, extra from clubes where liga_id = p_liga order by grupo, nome) c)); exception when others then null; end;
  begin r := r || jsonb_build_object('tatica', (select to_jsonb(t) from (select dados, atualizada_em from taticas where clube_id = p_clube) t)); exception when others then null; end;
  begin r := r || jsonb_build_object('admin', eh_admin()); exception when others then null; end;
  begin r := r || jsonb_build_object('extrato', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from (select temporada, rodada, tipo, valor, descricao, criado_em from lancamentos where clube_id = p_clube order by id desc limit 400) l)); exception when others then null; end;
  begin r := r || jsonb_build_object('comissao', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select * from treinadores where clube_id = p_clube and contratado order by id) t)); exception when others then null; end;
  begin r := r || jsonb_build_object('caixa', (select caixa from financas where clube_id = p_clube)); exception when others then null; end;
  begin r := r || jsonb_build_object('obra', (select to_jsonb(o) from obras o where clube_id = p_clube and not concluida)); exception when others then null; end;

  -- mercado
  begin r := r || jsonb_build_object('janela', janela_do_mercado(p_liga)); exception when others then null; end;
  begin r := r || jsonb_build_object('transferencias', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select * from transferencias where liga_id = p_liga order by id desc limit 200) t)); exception when others then null; end;
  begin r := r || jsonb_build_object('propostas', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('jogadores', (select to_jsonb(j) from (select nome, pos, idade from jogadores where id = p.jogador_id) j))), '[]')
    from (select * from propostas where comprador = p_clube or vendedor = p_clube order by id desc limit 60) p)); exception when others then null; end;
  begin r := r || jsonb_build_object('livres', (select coalesce(jsonb_agg(to_jsonb(j)), '[]') from (select id, clube_id, nome, idade, pos, fam, at, exp, pe, salario, salario_mercado, contrato_ate, livre_ate, oferta_liga_ate, livre_inicio, livre_abriu from jogadores where livre_liga = p_liga order by id) j)); exception when others then null; end;
  begin r := r || jsonb_build_object('lancesLivres', (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from (select jogador_id, clube_id, salario, temporadas, criada_em from ofertas_livres where jogador_id in (select id from jogadores where livre_liga = p_liga)) o)); exception when others then null; end;
  begin r := r || jsonb_build_object('ofertas', (select coalesce(jsonb_agg(to_jsonb(j)), '[]') from (select id, clube_id, nome, idade, pos, fam, at, exp, pe, salario, salario_mercado, contrato_ate, livre_ate, oferta_liga_ate from jogadores where oferta_liga_ate > now() order by id) j)); exception when others then null; end;

  -- olheiro, pré-contratos e agente
  begin r := r || jsonb_build_object('tetos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from relatorio_do_elenco() t)); exception when others then null; end;
  begin r := r || jsonb_build_object('relatorios', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select jogador_id, nivel, minimo, maximo from relatorios) x)); exception when others then null; end;
  begin r := r || jsonb_build_object('prePeriodo', periodo_de_pre_acordo(p_liga)); exception when others then null; end;
  begin r := r || jsonb_build_object('preContratos', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('jogadores', (select to_jsonb(j) from (select nome, pos, idade from jogadores where id = p.jogador_id) j))), '[]')
    from (select jogador_id, clube_id, temporada, salario, temporadas from pre_contratos) p)); exception when others then null; end;
  begin r := r || jsonb_build_object('cotacao', cotacao_do_agente(p_liga)); exception when others then null; end;

  -- base: jogos da temporada (liga de base do grupo, Copinha, Lib. Juvenil), campeões, prêmios, revelados, tática da base, safra
  begin r := r || jsonb_build_object('base', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from (select id, fase, rodada, copinha_fase, casa, fora, inicio, processada, gols_casa, gols_fora, vencedor, dados, chave from base_jogos
    where liga_id = p_liga and temporada = v_temp and (grupo = v_grupo or fase in ('copinha', 'libjuv')) order by id) b)); exception when others then null; end;
  begin r := r || jsonb_build_object('baseCampeoes', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from (select temporada, grupo, clube_id from base_campeoes where liga_id = p_liga order by temporada desc) b)); exception when others then null; end;
  begin r := r || jsonb_build_object('premios', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (select temporada, comp, premio, jogador_id, jogador, pos, clube_id, numero from premios_individuais where liga_id = p_liga order by temporada desc) p)); exception when others then null; end;
  begin r := r || jsonb_build_object('revelados', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select temporada, origem, jogador_id, nome, pos, idade, at from revelados where clube_id = p_clube order by temporada desc, id desc) x)); exception when others then null; end;
  begin r := r || jsonb_build_object('taticaBase', (select to_jsonb(t) from (select dados, atualizada_em from taticas_base where clube_id = p_clube) t)); exception when others then null; end;
  begin r := r || jsonb_build_object('safra', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from (select clube_id, jogador, pos, idade, nivel from safras where liga_id = p_liga and temporada = v_temp order by nivel desc) s)); exception when others then null; end;
  begin r := r || jsonb_build_object('rodadasFeitas', rodadas_completas(p_liga)); exception when others then null; end;

  -- jogos: copa e Libertadores, calendário do clube, partidas do grupo do clube e os resultados de todos eles
  begin r := r || jsonb_build_object('copa', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (select id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, processada, vencedor, chave from partidas where liga_id = p_liga and fase in ('copa', 'lib') order by copa_fase, id) p)); exception when others then null; end;
  begin r := r || jsonb_build_object('meusJogos', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (select id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, vencedor from partidas where liga_id = p_liga and (casa = p_clube or fora = p_clube) order by inicio, id) p)); exception when others then null; end;
  begin r := r || jsonb_build_object('partidasDoGrupo', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (select * from partidas where liga_id = p_liga and grupo = v_grupo order by rodada, id) p)); exception when others then null; end;
  begin
    select array_agg(id) into v_ids from partidas where liga_id = p_liga and (fase in ('copa', 'lib') or casa = p_clube or fora = p_clube or grupo = v_grupo);
    r := r || jsonb_build_object('resultados', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select partida_id, gols_casa, gols_fora, xg_casa, xg_fora, pts_esp_casa, pts_esp_fora, libera_em,
      relatorio->'penaltis' as penaltis, relatorio->'vencedor' as vencedor, relatorio->'prorrogacao' as prorrogacao from resultados where partida_id = any(coalesce(v_ids, '{}'))) x));
  exception when others then null; end;

  -- troféus (campeões de grupo e finalistas da copa), histórico de lances e transferências do clube, emprestados
  begin r := r || jsonb_build_object('trofeus', (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from (select temporada, clube_id, grupo, divisao, posicao, copa, supercopa, lib from historico
    where liga_id = p_liga and (posicao = 1 or copa in ('campeão', 'vice') or supercopa or lib = 'campeão') order by temporada) h)); exception when others then null; end;
  begin r := r || jsonb_build_object('meusLances', (select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object('jogadores', (select to_jsonb(j) from (select nome, pos, idade, clube_id, salario from jogadores where id = h.jogador_id) j))), '[]')
    from (select jogador_id, salario, temporadas, criada_em from historico_lances where clube_id = p_clube order by criada_em desc limit 60) h)); exception when others then null; end;
  begin r := r || jsonb_build_object('negocios', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (select * from transferencias where de_clube = p_clube or para_clube = p_clube order by id desc limit 100) t)); exception when others then null; end;
  begin r := r || jsonb_build_object('emprestados', (select coalesce(jsonb_agg(to_jsonb(j)), '[]') from (select id, nome, pos, idade, salario, clube_id, pais, formador from jogadores where emprestado_de = p_clube order by id) j)); exception when others then null; end;

  -- diretoria e clube extra
  begin r := r || jsonb_build_object('metas', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from (select clube_id, grupo, faixa_min, faixa_max from metas where liga_id = p_liga and temporada = v_temp) m)); exception when others then null; end;
  begin r := r || jsonb_build_object('confianca', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from (select clube_id, antes, depois, detalhes, verba from confianca_historico where liga_id = p_liga and temporada = v_temp - 1) c)); exception when others then null; end;
  -- como a leitura antiga (maybeSingle): para o administrador, que lê todas as linhas, volta nula
  begin r := r || jsonb_build_object('direitos', (select case when count(*) > 1 then null else coalesce(max(direitos), 0) end from dirigentes)); exception when others then null; end;
  begin r := r || jsonb_build_object('pedidoExtra', (select to_jsonb(p) from pedidos_extra p where user_id = auth.uid())); exception when others then null; end;

  -- notícias da Central: estatísticas da liga e campanhas da temporada passada
  begin r := r || jsonb_build_object('estatisticas', estatisticas_da_liga(p_liga, 'TODOS')); exception when others then null; end;
  begin r := r || jsonb_build_object('campanhas', (select coalesce(jsonb_agg(to_jsonb(h)), '[]') from (select clube_id, grupo, divisao, posicao, pontos, destino from historico where liga_id = p_liga and temporada = v_temp - 1) h)); exception when others then null; end;

  return r;
end $$;

revoke execute on function public.carga_do_clube(bigint, bigint) from public, anon;
grant execute on function public.carga_do_clube(bigint, bigint) to authenticated;
