-- Trem Soccer · clubes sem dirigente compram da lista de transferência.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Precisa do 46_janelas_aposentadoria_e_pre_acordo.sql, do 66_multa_e_bots.sql e do 67_cron_enxuto.sql. Pode ser executado mais de uma vez.
--
-- O dirigente põe o jogador à venda com um preço. Se ele ficar um tempo na lista (ligas.bots_espera_horas, 24 h) sem proposta de outro
-- dirigente, os clubes sem dono olham para ele UMA vez por janela: compra, pelo preço pedido, o bot que mais ganha com o reforço.
-- - Só com a janela aberta, só jogador listado, nunca pela multa e nunca por cima de uma proposta de dirigente.
-- - O preço precisa caber na conta do bot: até 4 vezes o salário de mercado do jogador (a multa é 5 vezes). Não há pechincha.
-- - O jogador precisa melhorar o time titular do bot em pelo menos 1,5 ponto de nota e ter até 31 anos.
-- - Um jogador por bot por janela; o caixa do bot fica acima de 25% do teto de folha.
-- - É uma venda negociada comum (fechar_negocio): mesma taxa de venda, mesmas travas (faixa de 60% a 150% da multa,
--   um negócio por temporada entre os mesmos dois clubes, quem chegou nesta janela não sai).
-- - Mudar o preço (ou tirar e pôr de novo na lista) zera a espera e faz os bots olharem outra vez.
-- A escolha é feita pela função "rodada" (src/mercadobots.js, comprasDeListados); aqui ficam a fila e o fechamento.
--
-- Para testar com o calendário compacto:  update ligas set bots_espera_horas = 0.05;  (3 minutos)

alter table public.jogadores add column if not exists listado_em timestamptz; -- quando entrou na lista (ou mudou de preço)
alter table public.jogadores add column if not exists bots_viram text;        -- '<temporada>:<janela>' em que os bots já olharam para ele
alter table public.ligas add column if not exists bots_espera_horas numeric not null default 24;
update public.jogadores set listado_em = now() where a_venda and listado_em is null;

-- Lista de transferência (do 20_venda_negociada.sql), agora anotando a hora e chamando os bots de volta.
create or replace function public.listar_jogador(p_jogador bigint, p_preco int) returns void
language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  select c.dono into v_dono from jogadores j join clubes c on c.id = j.clube_id where j.id = p_jogador;
  if v_dono is null or v_dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  update jogadores set a_venda = coalesce(p_preco, 0) > 0, preco_pedido = case when coalesce(p_preco, 0) > 0 then p_preco else null end,
    listado_em = now(), bots_viram = null where id = p_jogador;
end $$;
revoke execute on function public.listar_jogador(bigint, int) from public, anon;
grant execute on function public.listar_jogador(bigint, int) to authenticated;

-- A fila: listados por dirigente que já esperaram o prazo, sem proposta aberta, que os bots ainda não olharam nesta janela.
create or replace function public.listados_para_os_bots(p_liga bigint) returns setof public.jogadores
language sql stable security definer set search_path = public as $$
  select j.* from jogadores j join clubes c on c.id = j.clube_id join ligas g on g.id = c.liga_id
   where c.liga_id = p_liga and c.dono is not null and not coalesce(g.pausada, false)
     and j.a_venda and coalesce(j.preco_pedido, 0) > 0 and janela_do_mercado(g.id) is not null
     and j.listado_em <= now() - make_interval(secs => 3600 * g.bots_espera_horas)
     and j.bots_viram is distinct from g.temporada || ':' || janela_do_mercado(g.id)
     and not exists (select 1 from propostas p where p.jogador_id = j.id and p.estado in ('pendente', 'contra'))
   order by j.listado_em, j.id
$$;
revoke execute on function public.listados_para_os_bots(bigint) from public, anon, authenticated;
grant execute on function public.listados_para_os_bots(bigint) to service_role;

-- Fecha a compra escolhida pela função "rodada". Confere de novo o que pode ter mudado e passa pelo fechar_negocio, como uma proposta aceita.
create or replace function public.bot_compra_listado(p_jogador bigint, p_para bigint, p_valor int, p_salario int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype; v_de clubes%rowtype; v_para clubes%rowtype; v_l ligas%rowtype; v_janela text; v_teto int; v_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  select * into v_de from clubes where id = v_j.clube_id;
  select * into v_para from clubes where id = p_para;
  if v_j.id is null or v_de.dono is null or v_para.id is null or v_para.dono is not null or v_para.liga_id <> v_de.liga_id then raise exception 'Negócio inválido.'; end if;
  if not coalesce(v_j.a_venda, false) or v_j.preco_pedido is distinct from p_valor then raise exception 'O jogador saiu da lista ou mudou de preço.'; end if;
  select * into v_l from ligas where id = v_de.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null or coalesce(v_l.pausada, false) then raise exception 'O mercado está fechado.'; end if;
  if exists (select 1 from propostas where jogador_id = p_jogador and estado in ('pendente', 'contra')) then raise exception 'Há proposta de dirigente.'; end if;
  if exists (select 1 from transferencias where liga_id = v_l.id and temporada = v_l.temporada and janela = v_janela and tipo = 'negociada' and para_clube = p_para) then
    raise exception 'Esse clube já comprou da lista nesta janela.';
  end if;
  v_teto := teto_do_clube(p_para);
  if coalesce((select caixa from financas where clube_id = p_para), 0) - p_valor < 0.25 * v_teto then raise exception 'O caixa do comprador não comporta.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario, 0) or p_salario > 0.15 * v_teto then raise exception 'Salário fora dos limites.'; end if;
  insert into propostas (liga_id, temporada, jogador_id, comprador, vendedor, valor, salario, temporadas)
    values (v_l.id, v_l.temporada, p_jogador, p_para, v_de.id, p_valor, p_salario, 2) returning id into v_id;
  return fechar_negocio(v_id, p_valor);
end $$;
revoke execute on function public.bot_compra_listado(bigint, bigint, int, int) from public, anon, authenticated;
grant execute on function public.bot_compra_listado(bigint, bigint, int, int) to service_role;

-- Tarefas do minuto (do 67_cron_enxuto.sql): a função "rodada" também é chamada quando há listado na fila dos bots.
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
      into v_precisa;
  exception when others then v_precisa := true; -- na dúvida, chama a função
  end;
  return coalesce(v_precisa, true);
end $$;
revoke execute on function public.tarefas_do_minuto() from public, anon, authenticated;

select count(*) as listados_hoje from public.jogadores where a_venda;
