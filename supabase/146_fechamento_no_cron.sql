-- Trem Soccer · o agendamento chama a função "rodada" quando há temporada para fechar.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 145_fechamento_da_temporada.sql já executado. Não precisa republicar função nenhuma.
--
-- O agendamento de cada minuto só chama a função "rodada" quando tarefas_do_minuto() diz que ela tem trabalho. Depois do último jogo da temporada
-- não havia mais nada na lista, então o fechamento do 145 nunca rodava. Agora entra na lista: liga não pausada, temporada ainda não fechada,
-- todas as partidas calculadas, a última acabou há mais de uma hora e os playoffs chegaram à final (ou a temporada não tem playoffs).
-- O resto é o mesmo do que está no banco.

create or replace function public.tarefas_do_minuto() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  l record; v_precisa boolean;
begin
  -- as funções chamadas abaixo só aceitam o servidor (service_role) ou um administrador: o agendamento age como o servidor
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  for l in select id from ligas loop
    begin perform resolver_leiloes(l.id); exception when others then null; end;
    begin perform anunciar_aposentadorias(l.id); exception when others then null; end;
    begin perform copa_avancar(l.id); exception when others then null; end;
    begin perform bots_investem(l.id); exception when others then null; end;
  end loop;
  -- uma vez por hora, o histórico do agendamento fica só com os últimos 2 dias
  if extract(minute from now()) = 0 then
    begin delete from cron.job_run_details where end_time < now() - interval '2 days'; exception when others then null; end;
  end if;
  -- a função "rodada" tem trabalho?
  begin
    select
      -- partida cuja hora chegou, numa liga que não está pausada
      exists (select 1 from partidas p join ligas g on g.id = p.liga_id where not p.processada and p.inicio <= now() and not coalesce(g.pausada, false))
      -- efeitos de um apito final para gravar (lesões, suspensões, forma, caixa, treino)
      or exists (select 1 from resultados where efeitos is not null and libera_em <= now())
      -- jogo da liga de base na hora
      or exists (select 1 from base_jogos where not processada and inicio <= now())
      -- janela aberta sem a rodada de negócios entre bots
      or exists (select 1 from ligas g where not coalesce(g.pausada, false) and janela_do_mercado(g.id) is not null
                   and g.bots_mercado is distinct from g.temporada || ':' || janela_do_mercado(g.id))
      -- jogador listado por dirigente esperando os bots olharem
      or exists (select 1 from ligas g where exists (select 1 from listados_para_os_bots(g.id)))
      -- fase de liga (ou semifinais) encerrada e a fase seguinte dos playoffs ainda não criada
      or exists (select 1 from ligas g where not coalesce(g.pausada, false)
                   and exists (select 1 from partidas where liga_id = g.id and fase = 'liga')
                   and not exists (select 1 from partidas where liga_id = g.id and fase in ('liga', 'semi') and not processada)
                   and not exists (select 1 from partidas where liga_id = g.id and fase = 'final'))
      -- temporada acabada há mais de uma hora e ainda não fechada (145_fechamento_da_temporada.sql)
      or exists (select 1 from ligas g where not coalesce(g.pausada, false) and g.temporada_fechada is distinct from g.temporada
                   and (coalesce((g.copa->>'sem_playoffs')::boolean, false) or exists (select 1 from partidas where liga_id = g.id and fase = 'final'))
                   and not exists (select 1 from partidas where liga_id = g.id and not processada)
                   and (select max(fim) from partidas where liga_id = g.id) <= now() - interval '1 hour')
      into v_precisa;
  exception when others then v_precisa := true; -- na dúvida, chama a função
  end;
  return coalesce(v_precisa, true);
end $$;
