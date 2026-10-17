-- 110: fecha a brecha de contratar um jogador (livre ou não) e vendê-lo pelo agente na mesma janela.
-- Rodar depois do 109. Não exige republicar funções. Pode ser executado mais de uma vez.
--
-- O agente recusa o jogador cuja última chegada ao clube foi nesta temporada e na janela atual. Chegada fora de janela
-- (livre contratado entre as janelas ou no período da janela de saídas) também trava até a virada. Vale também no vermelho.

create or replace function public.vender_pelo_agente(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype; v_c clubes%rowtype; v_l ligas%rowtype;
  v_caixa int; v_vermelho boolean; v_janela text; v_mercado int; v_valor int; v_destino bigint; v_nome text; v_feitas int;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if exists (select 1 from partidas p where (p.casa = v_c.id or p.fora = v_c.id) and p.processada and p.fim > now()) then
    raise exception 'Há uma partida do seu clube em andamento. Venda depois do apito final.';
  end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  v_vermelho := coalesce(v_caixa, 0) < 0;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null and periodo_de_pre_acordo(v_l.id) then v_janela := 'saida'; end if; -- janela de saídas, entre a última rodada e a virada
  -- 110: quem chegou nesta janela (ou fora de janela, como o livre contratado entre as janelas) não sai pelo agente na mesma temporada/janela
  if exists (select 1 from transferencias t where t.id = (select max(id) from transferencias where jogador_id = v_j.id and para_clube = v_c.id)
      and t.temporada = v_l.temporada and (t.janela is null or t.janela = v_janela)) then
    raise exception 'Jogador contratado nesta janela não pode ser vendido pelo agente. Espere a próxima janela.';
  end if;
  if not v_vermelho then
    if v_janela is null then raise exception 'O agente só vende com a janela de transferências aberta.'; end if;
    if v_janela = 'saida' then
      if (select count(*) from transferencias where liga_id = v_l.id and temporada = v_l.temporada and de_clube = v_c.id and tipo = 'agente' and janela = 'saida') >= 2 then
        raise exception 'Você já fez as 2 vendas da janela de saídas.';
      end if;
    elsif (select count(*) from transferencias where liga_id = v_l.id and temporada = v_l.temporada and de_clube = v_c.id and tipo = 'agente' and janela is distinct from 'saida') >= 4 then
      raise exception 'Você já fez 4 vendas pelo agente nesta temporada.';
    end if;
  end if;
  v_mercado := coalesce(v_j.salario_mercado, v_j.salario);
  if v_mercado is null then raise exception 'Esse jogador não tem valor de mercado definido.'; end if;
  select count(*) into v_feitas from transferencias where liga_id = v_l.id and temporada = v_l.temporada and de_clube = v_c.id and tipo = 'agente';
  v_valor := round(v_mercado * (1 + (case when v_vermelho then 2 when v_feitas < 2 then 1.5 when v_feitas < 4 then 1 else 0.5 end) * cotacao_do_agente(v_l.id)));

  -- destino: clube sem dono do mesmo país com vaga, da mesma divisão ou abaixo, o de menor elenco (sem nenhum, qualquer clube sem dono do país com vaga)
  select c.id, c.nome into v_destino, v_nome from clubes c
    where c.liga_id = v_l.id and c.dono is null and c.pais = v_c.pais and vaga_no_elenco(c.id, v_j.idade) is null
    order by (c.divisao >= v_c.divisao) desc, (select count(*) from jogadores x where x.clube_id = c.id), random()
    limit 1;
  if v_destino is null then raise exception 'O agente não achou clube com vaga para esse jogador.'; end if;
  v_valor := pagar_pelos_bots(v_l.id, v_valor, 'Compra pelo agente: ' || v_j.nome); -- quem paga são os clubes sem dono; sem caixa neles, o valor encolhe

  update jogadores set clube_id = v_destino, salario = v_mercado, salario_mercado = v_mercado, contrato_ate = v_l.temporada + 1,
      protegido = false, protegido_ate = v_l.temporada, principal = false, treino = null
    where id = p_jogador;
  update financas set caixa = caixa + v_valor where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'venda', v_valor, 'Venda pelo agente: ' || v_j.nome || ' (' || v_nome || ')');
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, v_janela, case when v_vermelho then 'agente_vermelho' else 'agente' end, v_j.id, v_j.nome, v_j.pos, v_c.id, v_destino, v_valor);
  return v_j.nome || ' vendido pelo agente ao ' || v_nome || ' por ' || v_valor || ' mil.';
end $$;
