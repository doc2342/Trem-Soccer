-- 79: janela de saídas, teto com a volta dos emprestados e trava da dispensa.
-- Rodar depois do 78. Não exige republicar funções. Pode ser executado mais de uma vez.
--
-- 1. JANELA DE SAÍDAS. Depois da última rodada da liga e antes da virada (o período do pré-acordo), o dirigente pode vender
--    pelo agente até 2 jogadores, além das 4 vendas da temporada. Só saída: compras, multa e propostas seguem fechadas.
--    Serve para abrir espaço na folha antes de renovar. Fica em transferencias.janela = 'saida'.
-- 2. TETO COM A VOLTA. A renovação confere o teto já com os emprestados de volta (salário cheio), porque eles voltam na virada.
-- 3. TRAVA DA DISPENSA. O clube que dispensa um jogador não pode dar lance por ele no leilão nessa temporada nem na seguinte.
-- 4. CONSERTO do 77: o agente só manda jogador para clube sem dirigente do MESMO país (com a fronteira fechada, o agente
--    escolhia clube de fora e a venda falhava).

create or replace function public.folha_na_virada(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(salario), 0)::int from jogadores
    where (clube_id = p_clube and emprestado_de is null) or emprestado_de = p_clube
$$;
grant execute on function public.folha_na_virada(bigint) to anon, authenticated;

alter table public.jogadores add column if not exists dispensado_por bigint references public.clubes on delete set null; -- clube que dispensou
alter table public.jogadores add column if not exists dispensado_temporada int;                                           -- temporada da dispensa

-- ---------- 1 e 4: venda pelo agente ----------
create or replace function public.vender_pelo_agente(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype; v_c clubes%rowtype; v_l ligas%rowtype;
  v_caixa int; v_vermelho boolean; v_janela text; v_mercado int; v_valor int; v_destino bigint; v_nome text;
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
  v_valor := round(v_mercado * (1 + (case when v_vermelho then 2 else 1.5 end) * cotacao_do_agente(v_l.id)));

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

create or replace function public.venda_automatica(p_jogador bigint, p_descricao text) returns int
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype; v_l ligas%rowtype; v_mercado int; v_valor int; v_destino bigint; v_nome text;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.clube_id is null then return 0; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  select * into v_l from ligas where id = v_c.liga_id;
  v_mercado := coalesce(v_j.salario_mercado, v_j.salario, 0);
  v_valor := pagar_pelos_bots(v_l.id, round(v_mercado * (1 + 2 * cotacao_do_agente(v_l.id)))::int, 'Compra pelo agente: ' || v_j.nome);
  select c.id, c.nome into v_destino, v_nome from clubes c
    where c.liga_id = v_l.id and c.dono is null and c.pais = v_c.pais and vaga_no_elenco(c.id, v_j.idade) is null
    order by (c.divisao >= v_c.divisao) desc, (select count(*) from jogadores x where x.clube_id = c.id), random()
    limit 1;
  if v_destino is null then
    delete from jogadores where id = p_jogador; -- nenhum clube sem dono com vaga: o jogador encerra a carreira
  else
    update jogadores set clube_id = v_destino, salario = v_mercado, salario_mercado = v_mercado, contrato_ate = v_l.temporada + 1,
        protegido = false, protegido_ate = v_l.temporada, principal = false, treino = null, oferta_liga_ate = null
      where id = p_jogador;
    insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
      values (v_l.id, v_l.temporada, janela_do_mercado(v_l.id), 'agente_vermelho', v_j.id, v_j.nome, v_j.pos, v_c.id, v_destino, v_valor);
  end if;
  update financas set caixa = caixa + v_valor where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'venda', v_valor, p_descricao || v_j.nome || coalesce(' (' || v_nome || ')', ''));
  return v_valor;
end $$;

-- ---------- 2: renovação confere o teto com os emprestados de volta ----------
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0, p_com_luvas boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int; v_caixa int; v_pede int; v_luvas int := 0; v_virada int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < 0 then raise exception 'Com o caixa negativo, aumentos e renovações ficam bloqueados.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  v_teto := teto_do_clube(v_c.id);
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if coalesce(p_com_luvas, false) then
    if p_temporadas = 0 then raise exception 'Luvas só na renovação do contrato.'; end if;
    v_pede := round(coalesce(v_j.salario_mercado, 0) * (1 + 0.1 * (p_temporadas - 1)));
    if p_salario >= v_pede then raise exception 'Com esse salário não há luvas a pagar: renove sem elas.'; end if;
    if p_salario < round(v_pede * 0.7) then raise exception 'Nem com luvas: o mínimo é % mil por temporada (70%% do pedido, % mil).', round(v_pede * 0.7), v_pede; end if;
    v_luvas := ceil((v_pede - p_salario) * 1.5 * p_temporadas);
    if coalesce(v_caixa, 0) < v_luvas then raise exception 'As luvas custam % mil e o caixa é de % mil.', v_luvas, coalesce(v_caixa, 0); end if;
  elsif p_temporadas > 0 and p_salario < v_j.salario_mercado then
    raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado;
  end if;
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  v_folha := folha_do_clube(v_c.id);
  if v_folha - v_j.salario + p_salario > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_teto;
  end if;
  -- renovação: vale também a folha da virada, com os emprestados de volta pelo salário cheio
  v_virada := folha_na_virada(v_c.id);
  if p_temporadas > 0 and v_virada - v_j.salario + p_salario > v_teto then
    raise exception 'Com a volta dos emprestados na virada, a folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_virada - v_j.salario + p_salario, v_teto;
  end if;
  if v_luvas > 0 then
    perform set_config('trem.luvas', '1', true); -- o contrato progressivo não encurta: a diferença foi paga em luvas
    update financas set caixa = caixa - v_luvas where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_l.temporada, null, 'luvas', -v_luvas, 'Luvas: ' || v_j.nome || ' (' || p_temporadas || case when p_temporadas = 1 then ' temporada)' else ' temporadas)' end);
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
  if v_luvas > 0 then perform set_config('trem.luvas', '', true); end if;
end $$;

-- ---------- 3: trava da dispensa ----------
create or replace function public.dispensar_jogador(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if v_j.idade between 22 and 30 then raise exception 'Só dá para dispensar jogador de até 21 anos ou de 31 anos ou mais. Os outros saem pela lista de transferência.'; end if;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if exists (select 1 from partidas p where (p.casa = v_c.id or p.fora = v_c.id) and p.processada and p.fim > now()) then
    raise exception 'Há uma partida do seu clube em andamento. Dispense depois do apito final.';
  end if;
  update jogadores set clube_id = null, livre_liga = v_c.liga_id, livre_ate = null, livre_inicio = null, livre_abriu = null,
      salario = null, salario_mercado = coalesce(v_j.salario_mercado, v_j.salario), contrato_ate = null,
      protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null, treino = null,
      dispensado_por = v_c.id, dispensado_temporada = (select temporada from ligas where id = v_c.liga_id)
    where id = p_jogador;
  return v_j.nome || ' dispensado: está livre e pode ser contratado por qualquer outro clube.';
end $$;

-- quem dispensou não dá lance pelo jogador nessa temporada nem na seguinte
create or replace function public.trava_da_dispensa() returns trigger language plpgsql security definer set search_path = public as $$
declare v_por bigint; v_temp int; v_agora int;
begin
  select j.dispensado_por, j.dispensado_temporada into v_por, v_temp from jogadores j where j.id = new.jogador_id;
  if v_por is null or v_por <> new.clube_id then return new; end if;
  select l.temporada into v_agora from ligas l join clubes c on c.liga_id = l.id where c.id = new.clube_id;
  if v_agora <= v_temp + 1 then
    raise exception 'Seu clube dispensou esse jogador: só pode contratá-lo de novo a partir da temporada %.', v_temp + 2;
  end if;
  return new;
end $$;
drop trigger if exists trava_da_dispensa on public.ofertas_livres;
create trigger trava_da_dispensa before insert on public.ofertas_livres for each row execute function public.trava_da_dispensa();
