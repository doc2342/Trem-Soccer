-- Trem Soccer · 179: troca grátis do estádio para quem ampliou pela aba Estruturas e perdeu a troca da primeira ampliação (14/11/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 169 já executado. Depois: publicar o site. Não precisa republicar função.
--
-- O botão de ampliar da aba Estruturas não levava o modelo escolhido em Clube › Estádio: vários clubes passaram ao nível 2 no Tradicional
-- sem usar a troca grátis da primeira ampliação. Quem está assim (nível 2 ou mais, ou já em obra para o 2, ainda no Tradicional e sem troca
-- marcada) ganha estadio_visual.troca_livre: uma troca de modelo e/ou cidade, grátis e na hora, pelo "Trocar agora (grátis)".
-- A marca troca_livre_dada impede de dar de novo ao rodar o arquivo outra vez.
-- reformar_estadio é a do 169, com o caso troca_livre antes da troca grátis de estádio novo.

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
  if coalesce((v_c.estadio_visual->>'troca_livre')::boolean, false) then -- 179: grátis e na hora, modelo e cidade, uma vez
    if v_c.estadio_visual ?| array['modelo_alvo', 'cidade_alvo'] then raise exception 'Já há uma troca de modelo ou cidade em andamento.'; end if;
    update clubes set estadio_visual = (estadio_visual - 'troca_livre')
      || case when v_troca ? 'modelo_alvo' then jsonb_build_object('modelo', v_troca->>'modelo_alvo') else '{}'::jsonb end
      || case when v_troca ? 'cidade_alvo' then jsonb_build_object('cidade', v_troca->>'cidade_alvo') else '{}'::jsonb end where id = v_c.id;
    return;
  end if;
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

-- quem ganha (uma vez só)
update public.clubes c set estadio_visual = coalesce(c.estadio_visual, '{}'::jsonb) || '{"troca_livre": true, "troca_livre_dada": true}'::jsonb
 where c.dono is not null
   and coalesce(c.estadio_visual->>'modelo', 'tradicional') = 'tradicional'
   and not coalesce(c.estadio_visual ?| array['modelo_alvo', 'cidade_alvo', 'troca_livre_dada'], false)
   and (c.estadio_nivel >= 2 or exists (select 1 from public.obras o where o.clube_id = c.id and not o.concluida and o.estrutura = 'estadio' and o.nivel_alvo = 2));
