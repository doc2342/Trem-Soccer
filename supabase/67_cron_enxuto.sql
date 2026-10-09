-- Trem Soccer · agendamento enxuto: a função "rodada" só é chamada quando há trabalho para ela.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Precisa do 10_agendamento_com_segredo.sql (o agendamento "trem-rodada"), do 61_liga_de_base.sql e do 66_multa_e_bots.sql.
-- Pode ser executado mais de uma vez. Não precisa colar o segredo do cron: o agendamento existente é aproveitado.
--
-- Antes: a cada minuto o agendamento chamava a função "rodada", e cada chamada fazia umas 15 consultas pela API, mesmo sem jogo nenhum.
-- Cada consulta vira uma linha de log (Log Ingestion), cerca de 75 MB por dia só com a liga parada.
-- Agora: a cada minuto o próprio banco faz as tarefas que já são SQL (leilões, aposentadorias, avanço da copa e obras dos bots) e só
-- chama a função quando ela tem o que fazer: partida na hora, efeitos de um apito final para gravar, jogo da liga de base,
-- playoffs para criar ou a rodada de negócios entre bots da janela.
-- Também: as lesões e suspensões de cada partida passam a ser gravadas numa chamada só (aplicar_situacao), e o histórico do agendamento
-- (cron.job_run_details) guarda só os últimos 2 dias.
--
-- Para voltar ao agendamento antigo, rodar no SQL Editor:
--   select cron.alter_job(jobid, command := replace(command, ' where public.tarefas_do_minuto()', '')) from cron.job where jobname = 'trem-rodada';

-- ---------- tarefas do minuto ----------
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
      -- fase de liga (ou semifinais) encerrada e a fase seguinte dos playoffs ainda não criada
      or exists (select 1 from ligas g where not coalesce(g.pausada, false)
                   and exists (select 1 from partidas where liga_id = g.id and fase = 'liga')
                   and not exists (select 1 from partidas where liga_id = g.id and fase in ('liga', 'semi') and not processada)
                   and not exists (select 1 from partidas where liga_id = g.id and fase = 'final'))
      into v_precisa;
  exception when others then v_precisa := true; -- na dúvida, chama a função
  end;
  return coalesce(v_precisa, true);
end $$;
revoke execute on function public.tarefas_do_minuto() from public, anon, authenticated;

-- ---------- situação dos jogadores em lote ----------
-- p_lista: [{ id, fora, motivo, amarelos }], a situação de cada jogador que mudou numa partida (lesão, suspensão, amarelos)
create or replace function public.aplicar_situacao(p_lista jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  update jogadores j set fora_jogos = x.fora, fora_motivo = x.motivo, amarelos = x.amarelos
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, fora int, motivo text, amarelos int)
    where j.id = x.id;
end $$;
revoke execute on function public.aplicar_situacao(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_situacao(jsonb) to service_role;

-- ---------- agendamento ----------
-- o comando existente (com o segredo) ganha a condição: só chama a função quando tarefas_do_minuto() responde que há trabalho
do $$
declare v_id bigint; v_cmd text;
begin
  select jobid, command into v_id, v_cmd from cron.job where jobname = 'trem-rodada';
  if v_id is null then raise exception 'Não achei o agendamento "trem-rodada". Rode antes o 10_agendamento_com_segredo.sql.'; end if;
  if position('tarefas_do_minuto' in v_cmd) = 0 then
    v_cmd := regexp_replace(v_cmd, '[\s;]+$', '');
    perform cron.alter_job(v_id, command := v_cmd || ' where public.tarefas_do_minuto()');
  end if;
end $$;

select jobname, schedule, active, command like '%tarefas_do_minuto%' as enxuto from cron.job where jobname like 'trem-%' order by jobname;
