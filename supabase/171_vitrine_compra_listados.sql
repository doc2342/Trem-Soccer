-- Trem Soccer · 171: a vitrine compra da lista de transferência o que os bots não quiseram (aprovado em 31/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 152 (vitrine), do 167 (tarefas_do_minuto) e do 72 (bots_viram). Depois: publicar o site. Não precisa republicar função.
--
-- A escada de quem compra um jogador listado: outro dirigente (quando quiser) → bot (24 h na lista, até 4× o salário de mercado) →
-- vitrine. Quando os bots já olharam o listado nesta janela e não compraram, a vitrine compra pelo preço pedido, se for de até
-- 2,5× o salário de mercado (o agente paga hoje ~2,2× na 1ª venda; o piso entre dirigentes é 3×). O fundo paga e o jogador vai a leilão
-- na vitrine com lance mínimo de 3× o salário de mercado: cada um vendido no leilão devolve ao fundo pelo menos 0,5× a mais.
-- - Limite próprio: 2 por clube por temporada (tipo 'vitrine_lista'; não conta nas vendas pelo agente).
-- - Só com a janela aberta, a liga sem pausa e o fundo acima da reserva (25.000) depois de pagar.
-- - Mesmas travas do agente: o elenco fica com pelo menos 16, quem chegou nesta janela não sai, nada com partida do clube em andamento.
-- - Sem juvenil, sem emprestado e nunca por cima de uma proposta de dirigente em aberto.
-- Mudar o preço (listar_jogador) zera a espera: os bots olham de novo e só depois a vitrine.

create or replace function public.vitrine_compra_listados(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_janela text; x record; v_mercado int; v_pago int; v_vitrine bigint; n int := 0;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.eh_admin()) then raise exception 'Sem permissão.'; end if;
  select * into v_l from ligas where id = p_liga;
  if v_l.id is null or coalesce(v_l.pausada, false) then return 0; end if;
  v_janela := janela_do_mercado(p_liga);
  if v_janela is null then return 0; end if;
  for x in select j.id, j.nome, j.pos, j.preco_pedido, coalesce(j.salario_mercado, j.salario) mercado, c.id clube, c.dono
      from jogadores j join clubes c on c.id = j.clube_id
     where c.liga_id = p_liga and c.dono is not null and j.a_venda and coalesce(j.preco_pedido, 0) > 0
       and j.bots_viram = v_l.temporada || ':' || v_janela -- os bots já olharam nesta janela e não compraram
       and not coalesce(j.juvenil, false) and j.emprestado_de is null
       and j.preco_pedido <= floor(2.5 * coalesce(j.salario_mercado, j.salario))
       and not exists (select 1 from propostas p where p.jogador_id = j.id and p.estado in ('pendente', 'contra'))
     order by j.listado_em, j.id
  loop
    continue when (select count(*) from transferencias where liga_id = p_liga and temporada = v_l.temporada and de_clube = x.clube and tipo = 'vitrine_lista') >= 2;
    continue when (select count(*) from jogadores where clube_id = x.clube) <= 16;
    continue when exists (select 1 from transferencias t where t.id = (select max(id) from transferencias where jogador_id = x.id and para_clube = x.clube)
      and t.temporada = v_l.temporada and (t.janela is null or t.janela = v_janela));
    continue when exists (select 1 from partidas p where (p.casa = x.clube or p.fora = x.clube) and p.processada and p.fim > now());
    continue when coalesce((select fundo_taca from ligas where id = p_liga), 0) - x.preco_pedido < 25000; -- a reserva do fundo (RESERVA_DO_FUNDO)
    v_pago := pagar_pelo_fundo(p_liga, x.preco_pedido);
    continue when v_pago < x.preco_pedido; -- não deve acontecer (a reserva acima); por garantia, não paga menos que o pedido
    v_vitrine := vitrine_da_liga(p_liga);
    perform set_config('trem.vitrine', '1', true);
    update jogadores set clube_id = v_vitrine, vitrine_minimo = greatest(v_pago, 3 * x.mercado), vitrine_dono = x.dono, livre_ate = null, livre_inicio = null,
        salario = x.mercado, salario_mercado = x.mercado, contrato_ate = v_l.temporada + 1, protegido = false, protegido_ate = v_l.temporada,
        principal = false, treino = null, a_venda = false, preco_pedido = null, listado_em = null, bots_viram = null
      where id = x.id;
    update financas set caixa = caixa + v_pago where clube_id = x.clube;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (x.clube, v_l.temporada, null, 'venda', v_pago, 'Venda à vitrine, pela lista: ' || x.nome || ' (vai a leilão entre os dirigentes)');
    insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
      values (p_liga, v_l.temporada, v_janela, 'vitrine_lista', x.id, x.nome, x.pos, x.clube, v_vitrine, v_pago);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.vitrine_compra_listados(bigint) from public, anon, authenticated;

-- tarefas_do_minuto do 167, com a vitrine comprando os listados em cada liga
create or replace function public.tarefas_do_minuto() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  l record; v_precisa boolean;
begin
  -- as funções chamadas abaixo só aceitam o servidor (service_role) ou um administrador: o agendamento age como o servidor
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  begin perform concluir_obras(); exception when others then null; end;
  for l in select id from ligas loop
    begin perform resolver_leiloes(l.id); exception when others then null; end;
    begin perform anunciar_aposentadorias(l.id); exception when others then null; end;
    begin perform copa_avancar(l.id); exception when others then null; end;
    begin perform bots_investem(l.id); exception when others then null; end;
    begin perform vitrine_compra_listados(l.id); exception when others then null; end;
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
