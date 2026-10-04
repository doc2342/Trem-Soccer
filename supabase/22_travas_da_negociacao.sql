-- Trem Soccer · fase 2: travas da venda negociada, para ela não servir de atalho para trapaça.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 21_jogadores_livres.sql já executado. Não exige publicar função nenhuma de novo.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.
--
-- 1. Faixa de preço: o valor fica entre 60% e 150% da multa rescisória (3 a 7,5 vezes o salário).
-- 2. Entre os mesmos dois clubes, um negócio por temporada em cada sentido (A vende a B uma vez; B vende a A uma vez).
-- 3. Quarentena: quem saiu de um clube não volta a ele por negociação na mesma janela nem nas duas seguintes.
-- 4. O administrador pode anular uma transferência: jogador e dinheiro voltam.

alter table public.transferencias add column if not exists salario_antes int;        -- contrato que o jogador tinha no clube de origem,
alter table public.transferencias add column if not exists contrato_antes int;       -- para a anulação devolver tudo como estava
alter table public.transferencias add column if not exists protegido_ate_antes int;

create or replace function public.indice_da_janela(p_temporada int, p_janela text) returns int language sql immutable as $$
  select p_temporada * 2 + case when p_janela = 'meio' then 1 else 0 end
$$;

-- Devolve o motivo pelo qual o negócio não pode acontecer por esse valor, ou nulo se pode.
create or replace function public.trava_da_negociacao(p_jogador bigint, p_comprador bigint, p_valor int) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_l ligas%rowtype;
  v_agora int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.salario is null then return 'o jogador não tem contrato definido'; end if;
  if p_valor < 3 * v_j.salario then return 'o valor mínimo é de ' || 3 * v_j.salario || ' mil (60% da multa rescisória)'; end if;
  if p_valor > round(7.5 * v_j.salario) then return 'o valor máximo é de ' || round(7.5 * v_j.salario) || ' mil (150% da multa rescisória)'; end if;
  select l.* into v_l from clubes c join ligas l on l.id = c.liga_id where c.id = p_comprador;
  if exists (select 1 from transferencias t where t.liga_id = v_l.id and t.temporada = v_l.temporada and t.tipo = 'negociada'
      and t.de_clube = v_j.clube_id and t.para_clube = p_comprador) then
    return 'esse clube já vendeu um jogador ao seu nesta temporada (é um negócio por temporada em cada sentido)';
  end if;
  v_agora := indice_da_janela(v_l.temporada, janela_do_mercado(v_l.id));
  if exists (select 1 from transferencias t where t.jogador_id = p_jogador and t.de_clube = p_comprador
      and v_agora - indice_da_janela(t.temporada, t.janela) <= 2) then
    return 'o jogador saiu desse clube há pouco: ele só pode voltar depois de duas janelas';
  end if;
  return null;
end $$;
grant execute on function public.trava_da_negociacao(bigint, bigint, int) to authenticated;

create or replace function public.fazer_proposta(p_jogador bigint, p_valor int, p_salario int, p_temporadas int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_teto int; v_id bigint; v_trava text;
begin
  select * into v_para from clubes where dono = auth.uid();
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null or v_j.clube_id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.dono is null then raise exception 'Clube sem dono não negocia: dele, só pela multa rescisória.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  if janela_do_mercado(v_l.id) is null then raise exception 'O mercado está fechado. As janelas são até o fim da rodada 2 e entre as rodadas 9 e 11.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da proposta.'; end if;
  v_trava := trava_da_negociacao(p_jogador, v_para.id, p_valor);
  if v_trava is not null then raise exception 'Proposta recusada pelas regras: %.', v_trava; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < greatest(coalesce(v_j.salario, 0), coalesce(v_j.salario_mercado, 0)) then
    raise exception 'O salário oferecido ao jogador não pode ser menor que % mil por temporada.', greatest(coalesce(v_j.salario, 0), coalesce(v_j.salario_mercado, 0));
  end if;
  v_teto := teto_do_clube(v_para.id);
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  if coalesce((select caixa from financas where clube_id = v_para.id), 0) < p_valor then raise exception 'Seu caixa não cobre essa proposta.'; end if;
  update propostas set estado = 'cancelada', motivo = 'Substituída por uma proposta nova.', atualizada_em = now()
    where jogador_id = p_jogador and comprador = v_para.id and estado in ('pendente', 'contra');
  insert into propostas (liga_id, temporada, jogador_id, comprador, vendedor, valor, salario, temporadas)
    values (v_l.id, v_l.temporada, p_jogador, v_para.id, v_de.id, p_valor, p_salario, p_temporadas) returning id into v_id;
  return v_id;
end $$;

create or replace function public.fechar_negocio(p_proposta bigint, p_valor int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_p propostas%rowtype;
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_janela text; v_trava text;
  v_teto int; v_folha int; v_jogos int; v_taxa int;
begin
  select * into v_p from propostas where id = p_proposta for update;
  select * into v_j from jogadores where id = v_p.jogador_id for update;
  if v_j.id is null or v_j.clube_id is distinct from v_p.vendedor then raise exception 'O jogador não está mais nesse clube.'; end if;
  select * into v_de from clubes where id = v_p.vendedor;
  select * into v_para from clubes where id = v_p.comprador;
  select * into v_l from ligas where id = v_p.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null then raise exception 'O mercado está fechado: o negócio só fecha com a janela aberta.'; end if;
  v_trava := trava_da_negociacao(v_j.id, v_para.id, p_valor);
  if v_trava is not null then raise exception 'O negócio não pode ser fechado: %.', v_trava; end if;
  if v_janela = 'meio' and v_para.divisao = v_de.divisao then
    select count(*) into v_jogos from resultados r join partidas p on p.id = r.partida_id
      where p.liga_id = v_l.id and p.fase = 'liga' and (p.casa = v_de.id or p.fora = v_de.id)
        and exists (select 1 from jsonb_array_elements(r.relatorio->'jogadores') x where x->>'id' = 'j' || v_j.id);
    if v_jogos >= 5 then raise exception 'Na janela do meio, quem já jogou 5 partidas de liga pelo clube não vai para outro da mesma divisão (ele jogou %).', v_jogos; end if;
  end if;
  if (select count(*) from jogadores where clube_id = v_para.id) >= 50 then raise exception 'O elenco do comprador já tem 50 jogadores.'; end if;
  if (select count(*) from jogadores where clube_id = v_de.id) <= 16 then raise exception 'O elenco do vendedor não pode ficar com menos de 16 jogadores.'; end if;
  v_teto := teto_do_clube(v_para.id);
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_para.id;
  if v_folha + v_p.salario > v_teto then raise exception 'A folha do comprador passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_p.salario, v_teto; end if;
  if coalesce((select caixa from financas where clube_id = v_para.id), 0) < p_valor then raise exception 'O caixa do comprador não cobre o valor (% mil).', p_valor; end if;

  v_taxa := round(p_valor * taxa_da_venda(v_j.id));
  update financas set caixa = caixa - p_valor where clube_id = v_para.id;
  update financas set caixa = caixa + p_valor - v_taxa where clube_id = v_de.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_para.id, v_l.temporada, null, 'compra', -p_valor, 'Compra negociada: ' || v_j.nome || ' (' || v_de.nome || ')'),
    (v_de.id, v_l.temporada, null, 'venda', p_valor, 'Venda negociada: ' || v_j.nome || ' (' || v_para.nome || ')'),
    (v_de.id, v_l.temporada, null, 'taxa', -v_taxa, 'Taxa de venda (' || round(100.0 * v_taxa / p_valor) || '%): ' || v_j.nome);
  update propostas set estado = 'aceita', atualizada_em = now() where id = p_proposta;
  update jogadores set clube_id = v_para.id, salario = v_p.salario, contrato_ate = v_l.temporada + v_p.temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada, chegou_janela = v_janela
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor, taxa, salario_antes, contrato_antes, protegido_ate_antes)
    values (v_l.id, v_l.temporada, v_janela, 'negociada', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, p_valor, v_taxa, v_j.salario, v_j.contrato_ate, v_j.protegido_ate);
  return v_j.nome || ' vendido por ' || p_valor || ' mil (taxa de ' || v_taxa || ' mil).';
end $$;
revoke execute on function public.fechar_negocio(bigint, int) from public, anon, authenticated;

create or replace function public.responder_proposta(p_id bigint, p_acao text, p_valor int default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_p propostas%rowtype; v_trava text;
begin
  select * into v_p from propostas where id = p_id;
  if v_p.id is null or not exists (select 1 from clubes where id = v_p.vendedor and dono = auth.uid()) then raise exception 'Essa proposta não é para o seu clube.'; end if;
  if v_p.estado <> 'pendente' then raise exception 'Essa proposta não está mais aguardando a sua resposta.'; end if;
  if p_acao = 'aceitar' then return fechar_negocio(p_id, v_p.valor);
  elsif p_acao = 'recusar' then update propostas set estado = 'recusada', atualizada_em = now() where id = p_id; return 'Proposta recusada.';
  elsif p_acao = 'contrapropor' then
    if p_valor is null or p_valor <= v_p.valor then raise exception 'A contraproposta precisa ser maior que o valor oferecido.'; end if;
    v_trava := trava_da_negociacao(v_p.jogador_id, v_p.comprador, p_valor);
    if v_trava is not null then raise exception 'Contraproposta recusada pelas regras: %.', v_trava; end if;
    update propostas set estado = 'contra', contra_valor = p_valor, atualizada_em = now() where id = p_id;
    return 'Contraproposta enviada.';
  end if;
  raise exception 'Resposta desconhecida.';
end $$;

-- Anulação pelo administrador: o jogador volta ao clube de origem e o dinheiro é devolvido. Vale para compra pela multa,
-- venda negociada e oferta à liga, enquanto o jogador ainda estiver no clube que o comprou. O registro da transferência é apagado,
-- para os limites da temporada voltarem a contar como antes. (O jogador de reposição de um clube sem dono fica onde está.)
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
  delete from transferencias where id = p_id;
  return 'Transferência de ' || v_t.jogador || ' anulada.';
end $$;
revoke execute on function public.anular_transferencia(bigint) from public, anon;
grant execute on function public.anular_transferencia(bigint) to authenticated;
