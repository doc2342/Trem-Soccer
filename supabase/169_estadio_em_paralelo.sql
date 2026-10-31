-- Trem Soccer · 169: prazos novos das obras e o estádio em paralelo com uma estrutura (30/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 154 (iniciar_obra, reformar_estadio) e do 167 (obras em dias). Depois: publicar o site. Não precisa republicar função.
--
-- 1. Prazos (em dias): 1, 3, 6, 10, 15, 21, 30, 42 (eram 1, 4, 8, 14, 23, 28, 34, 46); a reforma segue em metade. Obras em andamento não mudam.
--    Uma estrutura do zero ao nível 5: 35 dias (~1,3 temporada de 28 dias); o estádio do 1 ao 8: 127 dias (~4,5 temporadas).
-- 2. Dois canteiros por clube: um para as estruturas (CT, médico, fisioterapia, base) e um para o estádio (ampliação ou troca de modelo).
--    Tudo no máximo cai de ~9,5 para ~5 temporadas. Como nos clubes de verdade, a obra do estádio e a do CT correm ao mesmo tempo.
--    iniciar_obra e reformar_estadio são as do 154 (conferidas com o banco em 30/10), só com a trava por canteiro.
-- 3. Uma vez só: 1 dia a menos em todas as obras em andamento, para compensar os dias de copa que não contavam antes do 167.
--    A marca de que já foi feito é o índice novo (obras_uma_por_canteiro): rodando o arquivo de novo, não desconta outra vez.

create or replace function public.prazo_da_obra(p_nivel int) returns int language sql immutable as $$
  select (array[1, 3, 6, 10, 15, 21, 30, 42])[p_nivel]
$$;

do $$ begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'obras_uma_por_canteiro') then
    update public.obras o set termina_em = o.termina_em - make_interval(secs => 3600 * public.horas_do_dia(c.liga_id)),
      rodadas_restantes = greatest(0, o.rodadas_restantes - 1)
    from public.clubes c where c.id = o.clube_id and not o.concluida and o.termina_em is not null;
  end if;
end $$;
-- a obra que venceu com o desconto é entregue pelo agendamento do minuto seguinte (concluir_obras, do 167)

drop index if exists public.obras_uma_por_clube;
create unique index if not exists obras_uma_por_canteiro on public.obras (clube_id, (estrutura in ('estadio', 'estadio_modelo'))) where not concluida;

create or replace function public.iniciar_obra(p_estrutura text, p_modelo text default null, p_cidade text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_nivel int; v_custo int; v_taxa int := 0; v_caixa int; v_troca jsonb := '{}'::jsonb;
begin
  select * into v_c from clubes where id = public.meu_clube() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_estrutura not in ('ct', 'medico', 'fisio', 'base', 'estadio') then raise exception 'Estrutura desconhecida.'; end if;
  if p_estrutura <> 'estadio' and (p_modelo is not null or p_cidade is not null) then raise exception 'Modelo e cidade só valem para o estádio.'; end if;
  if p_estrutura = 'estadio' then v_troca := troca_do_estadio(v_c.id, p_modelo, p_cidade); end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida and (estrutura in ('estadio', 'estadio_modelo')) = (p_estrutura = 'estadio')) then
    raise exception '%', case when p_estrutura = 'estadio' then 'O estádio já está em obra.' else 'Já há uma obra de estrutura em andamento: cabe uma de estrutura e uma do estádio ao mesmo tempo.' end;
  end if;
  v_nivel := 1 + case p_estrutura when 'ct' then v_c.ct_nivel when 'medico' then v_c.medico_nivel when 'fisio' then v_c.fisio_nivel
    when 'base' then v_c.base_nivel else v_c.estadio_nivel end;
  if v_nivel > (case when p_estrutura = 'estadio' then 8 else 5 end) then raise exception 'Essa estrutura já está no nível máximo.'; end if;
  v_custo := custo_da_obra(p_estrutura, v_nivel);
  if v_troca <> '{}'::jsonb and v_nivel > 2 then v_taxa := round(0.5 * v_custo); end if; -- a primeira ampliação troca de graça
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo + v_taxa then raise exception 'Caixa insuficiente: a obra custa % mil e o caixa é de % mil.', v_custo + v_taxa, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo - v_taxa where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -(v_custo + v_taxa), 'Obra: ' || p_estrutura || ' para o nível ' || v_nivel || case when v_taxa > 0 then ' + troca de modelo/cidade' else '' end);
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, p_estrutura, v_nivel, v_custo + v_taxa, prazo_da_obra(v_nivel), prazo_da_obra(v_nivel));
  if v_troca <> '{}'::jsonb then
    update clubes set estadio_visual = (coalesce(estadio_visual, '{}'::jsonb) - 'modelo_alvo' - 'cidade_alvo') || v_troca where id = v_c.id;
  end if;
end $$;
revoke execute on function public.iniciar_obra(text, text, text) from public, anon;
grant execute on function public.iniciar_obra(text, text, text) to authenticated;

create or replace function public.reformar_estadio(p_modelo text, p_cidade text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_l ligas%rowtype;
  v_custo int := custo_da_obra('estadio', 8) / 2; v_prazo int := prazo_da_obra(8) / 2; v_caixa int; v_para jsonb; v_troca jsonb;
begin
  select * into v_c from clubes where id = public.meu_clube() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  v_troca := troca_do_estadio(v_c.id, p_modelo, p_cidade);
  if v_troca = '{}'::jsonb then raise exception 'O estádio já é desse modelo e dessa cidade.'; end if;
  if v_troca ? 'modelo_alvo' and coalesce(v_c.estadio_visual->'reforma_gratis_para' ? p_modelo, false) then -- grátis e na hora; ignora a cidade
    if v_c.estadio_visual ? 'modelo_alvo' then raise exception 'Já há uma troca de modelo em andamento.'; end if;
    v_para := gratis_para_lista(v_c.estadio_visual) - p_modelo;
    update clubes set estadio_visual = (estadio_visual - 'reforma_gratis_para') || jsonb_build_object('modelo', p_modelo)
      || case when jsonb_array_length(v_para) > 0 then jsonb_build_object('reforma_gratis_para', v_para) else '{}'::jsonb end where id = v_c.id;
    return;
  end if;
  if v_c.estadio_nivel < 8 then raise exception 'A troca de modelo ou cidade só sai junto com uma ampliação; no nível 8, é uma obra de 15 mi.'; end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida and estrutura in ('estadio', 'estadio_modelo')) then raise exception 'O estádio já está em obra.'; end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo then raise exception 'Caixa insuficiente: a troca custa % mil e o caixa é de % mil.', v_custo, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: troca de modelo/cidade do estádio');
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, 'estadio_modelo', 8, v_custo, v_prazo, v_prazo);
  update clubes set estadio_visual = (coalesce(estadio_visual, '{}'::jsonb) - 'modelo_alvo' - 'cidade_alvo') || v_troca where id = v_c.id;
end $$;
revoke execute on function public.reformar_estadio(text, text) from public, anon;
grant execute on function public.reformar_estadio(text, text) to authenticated;
