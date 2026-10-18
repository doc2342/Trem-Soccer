-- Trem Soccer · modelos "Estádio do Braga" (laterais, sem a rocha) e "Allianz Arena" (inflavel), com a troca grátis de cada um (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Precisa do 127. Pode ser executado mais de uma vez.
--
-- reforma_gratis_para passa a ser uma LISTA de modelos (o 127 guardava um só, em texto): cada estádio novo soma uma troca grátis,
-- e lançar dois de uma vez não apaga o anterior. Um texto antigo (a Bomboneira do 127) vale como lista de um.

create or replace function public.gratis_para_lista(v jsonb) returns jsonb language sql immutable as $$
  select case jsonb_typeof(v->'reforma_gratis_para') when 'array' then v->'reforma_gratis_para' when 'string' then jsonb_build_array(v->'reforma_gratis_para') else '[]'::jsonb end
$$;

create or replace function public.liberar_troca_gratis(p_modelo text) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update clubes set estadio_visual = coalesce(estadio_visual, '{}'::jsonb)
      || jsonb_build_object('reforma_gratis_para', gratis_para_lista(estadio_visual) || to_jsonb(p_modelo), 'gratis_dada_' || p_modelo, true)
   where dono is not null and coalesce(estadio_visual->>'modelo', 'tradicional') <> p_modelo and not coalesce(estadio_visual ? ('gratis_dada_' || p_modelo), false);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.liberar_troca_gratis(text) from public, anon, authenticated; -- só o administrador, pelo SQL Editor

-- ---------- reforma de modelo: aceita os dois novos e gasta a troca grátis da lista (o resto igual ao 127) ----------
create or replace function public.reformar_estadio(p_modelo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_l ligas%rowtype;
  v_custo int; v_prazo int; v_caixa int; v_para jsonb;
begin
  select * into v_c from clubes where id = public.meu_clube() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_modelo not in ('tradicional', 'caldeirao', 'arena', 'dunas', 'ferradura', 'bomboneira', 'laterais', 'inflavel') then raise exception 'Modelo desconhecido.'; end if;
  if p_modelo = coalesce(v_c.estadio_visual->>'modelo', 'tradicional') then raise exception 'O estádio já é desse modelo.'; end if;
  if exists (select 1 from obras where clube_id = v_c.id and estrutura = 'estadio_modelo' and not concluida) then raise exception 'Já há uma reforma de modelo em andamento.'; end if;
  if coalesce(v_c.estadio_visual->'reforma_gratis_para' ? p_modelo, false) then -- a troca grátis de estádio novo vale só para ele e é gasta antes da geral
    v_para := gratis_para_lista(v_c.estadio_visual) - p_modelo;
    update clubes set estadio_visual = (estadio_visual - 'reforma_gratis_para' - 'modelo_alvo') || jsonb_build_object('modelo', p_modelo)
      || case when jsonb_array_length(v_para) > 0 then jsonb_build_object('reforma_gratis_para', v_para) else '{}'::jsonb end where id = v_c.id;
    return;
  end if;
  if coalesce((v_c.estadio_visual->>'reforma_gratis')::boolean, false) then
    update clubes set estadio_visual = (estadio_visual - 'reforma_gratis' - 'modelo_alvo') || jsonb_build_object('modelo', p_modelo) where id = v_c.id;
    return;
  end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida) then raise exception 'Já existe uma obra em andamento. Só cabe uma por vez.'; end if;
  v_custo := custo_da_reforma(v_c.estadio_nivel);
  v_prazo := prazo_da_reforma(v_c.estadio_nivel);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo then raise exception 'Caixa insuficiente: a reforma custa % mil e o caixa é de % mil.', v_custo, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: reforma do estádio para o modelo ' || p_modelo);
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, 'estadio_modelo', greatest(1, v_c.estadio_nivel), v_custo, v_prazo, v_prazo);
  update clubes set estadio_visual = coalesce(estadio_visual, '{}'::jsonb) || jsonb_build_object('modelo_alvo', p_modelo) where id = v_c.id;
end $$;
revoke execute on function public.reformar_estadio(text) from public, anon;
grant execute on function public.reformar_estadio(text) to authenticated;

select public.liberar_troca_gratis('laterais') as troca_gratis_duas_laterais, public.liberar_troca_gratis('inflavel') as troca_gratis_inflavel;
