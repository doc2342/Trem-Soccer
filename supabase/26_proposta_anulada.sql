-- Trem Soccer · ajuste da anulação: a proposta do negócio anulado passa a aparecer como "anulada pelo administrador" (antes ficava como aceita).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 22_travas_da_negociacao.sql já executado. Pode ser executado mais de uma vez.

-- conserta as que já foram anuladas: proposta aceita cuja transferência não existe mais
update public.propostas p set estado = 'anulada', motivo = 'Negócio anulado pelo administrador.', atualizada_em = now()
  where p.estado = 'aceita'
    and not exists (select 1 from public.transferencias t where t.jogador_id = p.jogador_id and t.para_clube = p.comprador and t.de_clube = p.vendedor)
    and not exists (select 1 from public.jogadores j where j.id = p.jogador_id and j.clube_id = p.comprador);

create or replace function public.anular_transferencia(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t transferencias%rowtype;
  v_j jogadores%rowtype;
  v_temp int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador anula transferências.'; end if;
  select * into v_t from transferencias where id = p_id for update;
  if v_t.id is null then raise exception 'Transferência não encontrada.'; end if;
  if v_t.de_clube is null or v_t.para_clube is null then raise exception 'Essa transferência não tem clube de origem para onde voltar.'; end if;
  select * into v_j from jogadores where id = v_t.jogador_id for update;
  if v_j.id is null or v_j.clube_id is distinct from v_t.para_clube then raise exception 'O jogador não está mais no clube que o comprou: não dá para anular.'; end if;
  select temporada into v_temp from ligas where id = v_t.liga_id;

  update financas set caixa = caixa + v_t.valor where clube_id = v_t.para_clube;
  update financas set caixa = caixa - (v_t.valor - v_t.taxa) where clube_id = v_t.de_clube;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_t.para_clube, v_temp, null, 'anulacao', v_t.valor, 'Transferência anulada: ' || v_t.jogador || ' (valor devolvido)'),
    (v_t.de_clube, v_temp, null, 'anulacao', -(v_t.valor - v_t.taxa), 'Transferência anulada: ' || v_t.jogador || ' (valor devolvido)');
  -- a taxa que já tinha ido para o fundo sai da parte guardada para a segunda taça
  if v_t.taxa > 0 and v_t.taxa_distribuida then update ligas set fundo_taca = fundo_taca - v_t.taxa where id = v_t.liga_id; end if;

  update jogadores set clube_id = v_t.de_clube,
    salario = coalesce(v_t.salario_antes, salario), contrato_ate = coalesce(v_t.contrato_antes, contrato_ate),
    protegido_ate = case when v_t.salario_antes is not null then v_t.protegido_ate_antes else protegido_ate end,
    chegou_temporada = null, chegou_janela = null
    where id = v_j.id;
  -- a volta não conta como chegada: sem isto, o gatilho de troca de clube marcaria o jogador como recém-chegado
  update jogadores set chegou_temporada = null, chegou_janela = null where id = v_j.id;
  -- a proposta que deu origem ao negócio deixa de aparecer como aceita
  update propostas set estado = 'anulada', motivo = 'Negócio anulado pelo administrador.', atualizada_em = now()
    where jogador_id = v_t.jogador_id and comprador = v_t.para_clube and vendedor = v_t.de_clube and estado = 'aceita';
  delete from transferencias where id = p_id;
  return 'Transferência de ' || v_t.jogador || ' anulada.';
end $$;
revoke execute on function public.anular_transferencia(bigint) from public, anon;
grant execute on function public.anular_transferencia(bigint) to authenticated;
