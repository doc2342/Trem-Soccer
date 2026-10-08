-- Trem Soccer · multa pelo valor de hoje, bots que investem e mercado entre bots.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois, republicar as funções "mercado" e "rodada". Pode ser executado mais de uma vez.
--
-- 1. Multa rescisória: 5 vezes o maior entre o salário do contrato e o valor de hoje do jogador (salário de mercado pela nota atual).
--    O salário mínimo de quem compra pela multa segue a mesma conta. Fecha a brecha do jovem que evoluiu no treino com o salário antigo.
--    (Na virada, o salário de mercado de todos é recalculado, e os clubes sem dono reajustam quem ganha abaixo dele: src/virada.js.)
-- 2. Bots investem: clube sem dono, sem obra em andamento e com caixa folgado constrói rumo aos níveis-alvo da divisão (bots_investem).
-- 3. Mercado entre bots: uma vez por janela, a função "rodada" monta os negócios (src/mercadobots.js) e transferir_entre_bots grava,
--    conferindo de novo janela, caixa, teto de folha, tamanho dos elencos, idade (só mais de 21) e divisão (o talento só sobe ou fica:
--    o bot compra da mesma divisão ou de uma abaixo). Bot no vermelho vende mais barato. Fica em transferencias com tipo 'bot'.

-- ---------- 1. multa ----------
drop function if exists public.comprar_pela_multa(uuid, bigint, int, int, jsonb);
create or replace function public.comprar_pela_multa(p_user uuid, p_jogador bigint, p_salario int, p_temporadas int, p_reposicao jsonb default null, p_mercado int default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_janela text;
  v_valor int; v_multa int; v_teto int; v_folha int; v_caixa int; v_jogos int; v_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_para from clubes where dono = p_user;
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.liga_id <> v_para.liga_id then raise exception 'O jogador é de outra liga.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null then raise exception 'O mercado está fechado. As janelas são até o fim da rodada 2 e entre as rodadas 9 e 11.'; end if;

  -- quem tem multa
  if v_j.salario is null then raise exception 'Esse jogador ainda não tem contrato definido.'; end if;
  if v_j.protegido then raise exception 'Esse jogador está na lista de protegidos do clube: não tem multa rescisória.'; end if;
  if coalesce(v_j.protegido_ate, -1) >= v_l.temporada then raise exception 'Esse jogador está na primeira temporada de contrato no clube: a multa só vale a partir da próxima.'; end if;
  -- o valor do jogador é o maior entre o salário do contrato, o salário de mercado gravado e o de hoje (p_mercado, pela nota atual,
  -- calculado pela função "mercado"): o jovem que evoluiu com salário antigo não sai mais barato
  v_valor := greatest(v_j.salario, coalesce(v_j.salario_mercado, 0), coalesce(p_mercado, 0));
  v_multa := 5 * v_valor;

  -- travas
  if v_para.divisao > v_de.divisao then raise exception 'O jogador não desce de divisão pela multa rescisória.'; end if;
  if v_janela = 'meio' and v_para.divisao = v_de.divisao then
    select count(*) into v_jogos from resultados r join partidas p on p.id = r.partida_id
      where p.liga_id = v_l.id and p.fase = 'liga' and (p.casa = v_de.id or p.fora = v_de.id)
        and exists (select 1 from jsonb_array_elements(r.relatorio->'jogadores') x where x->>'id' = 'j' || v_j.id);
    if v_jogos >= 5 then raise exception 'Na janela do meio, quem já jogou 5 partidas de liga pelo clube não vai para outro da mesma divisão (ele jogou %).', v_jogos; end if;
  end if;
  if (select count(*) from transferencias where para_clube = v_para.id and temporada = v_l.temporada and tipo = 'multa') >= 4 then
    raise exception 'Você já fez as 4 compras pela multa desta temporada.';
  end if;
  if (select count(*) from transferencias where de_clube = v_de.id and temporada = v_l.temporada and tipo = 'multa') >= (case when v_de.dono is null then 2 else 3 end) then
    raise exception 'Esse clube já perdeu o máximo de jogadores pela multa nesta temporada.';
  end if;
  if v_de.dono is null and exists (select 1 from transferencias where de_clube = v_de.id and temporada = v_l.temporada and tipo = 'multa' and janela = v_janela) then
    raise exception 'Clube sem dono só perde um jogador por janela, e este já perdeu.';
  end if;
  if (select count(*) from jogadores where clube_id = v_para.id) >= 50 then raise exception 'Seu elenco já tem 50 jogadores.'; end if;

  -- contrato novo
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_valor then
    raise exception 'O salário novo não pode ser menor que % mil por temporada.', v_valor;
  end if;
  v_teto := teto_do_clube(v_para.id);
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_para.id;
  if v_folha + p_salario > v_teto then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + p_salario, v_teto; end if;

  -- dinheiro
  select caixa into v_caixa from financas where clube_id = v_para.id;
  if coalesce(v_caixa, 0) < v_multa then raise exception 'Caixa insuficiente: a multa é de % mil e o seu caixa é de % mil.', v_multa, coalesce(v_caixa, 0); end if;
  update financas set caixa = caixa - v_multa where clube_id = v_para.id;
  insert into financas (clube_id, caixa) values (v_de.id, 5000 + v_multa) on conflict (clube_id) do update set caixa = financas.caixa + v_multa;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_para.id, v_l.temporada, null, 'compra', -v_multa, 'Multa rescisória paga: ' || v_j.nome || ' (' || v_de.nome || ')'),
    (v_de.id, v_l.temporada, null, 'venda', v_multa, 'Multa rescisória recebida: ' || v_j.nome || ' (' || v_para.nome || ')');

  -- o jogador muda de clube, com contrato novo e protegido até o fim da temporada
  update jogadores set clube_id = v_para.id, salario = p_salario, salario_mercado = greatest(coalesce(v_j.salario_mercado, 0), coalesce(p_mercado, 0)), contrato_ate = v_l.temporada + p_temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, v_janela, 'multa', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, v_multa);

  -- clube sem dono repõe com um jogador gerado da mesma nota
  if v_de.dono is null and p_reposicao is not null then
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, chegou_temporada)
      values (v_de.id, p_reposicao->>'nome', coalesce(p_reposicao->>'pais', 'Brasil'), (p_reposicao->>'idade')::smallint, p_reposicao->>'pos', p_reposicao->'fam',
        array(select jsonb_array_elements_text(p_reposicao->'at')::smallint), v_j.principal,
        (p_reposicao->>'salario')::int, (p_reposicao->>'salario_mercado')::int, (p_reposicao->>'contrato_ate')::int, (p_reposicao->>'protegido_ate')::int, v_l.temporada)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (p_reposicao->>'tal')::smallint);
  end if;
  return v_j.nome || ' contratado por ' || v_multa || ' mil de multa rescisória.';
end $$;
revoke execute on function public.comprar_pela_multa(uuid, bigint, int, int, jsonb, int) from public, anon, authenticated;
grant execute on function public.comprar_pela_multa(uuid, bigint, int, int, jsonb, int) to service_role;

-- ---------- 2. bots investem ----------
-- Níveis-alvo de cada estrutura por divisão (1 = Série A). O bot só obra se, depois de pagar, o caixa ainda ficar acima de 40% do teto
-- de folha: 25% de reserva e 15% para um reforço na janela (o mercado entre bots usa o mesmo caixa),
-- uma obra por vez, pela estrutura mais longe do alvo (na ordem: CT, médico, base, fisioterapia, estádio).
create or replace function public.bots_investem(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record; v_alvo jsonb; v_estr text; v_nivel int; v_falta int; v_melhor text; v_melhor_falta int; v_custo int; v_caixa int; v_reserva numeric; v_l ligas%rowtype; n int := 0;
  c_alvos jsonb := '{"1": {"ct": 3, "medico": 2, "base": 3, "fisio": 2, "estadio": 3}, "2": {"ct": 2, "medico": 1, "base": 2, "fisio": 1, "estadio": 2}, "3": {"ct": 1, "medico": 1, "base": 1, "fisio": 0, "estadio": 1}}';
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.eh_admin()) then raise exception 'Sem permissão.'; end if;
  select * into v_l from ligas where id = p_liga;
  if v_l.id is null or v_l.pausada then return 0; end if;
  for c in select cl.* from clubes cl where cl.liga_id = p_liga and cl.dono is null
             and not exists (select 1 from obras o where o.clube_id = cl.id and not o.concluida) loop
    v_alvo := c_alvos -> least(3, greatest(1, coalesce(c.divisao, 3)))::text;
    v_melhor := null; v_melhor_falta := 0;
    foreach v_estr in array array['ct', 'medico', 'base', 'fisio', 'estadio'] loop
      v_nivel := case v_estr when 'ct' then c.ct_nivel when 'medico' then c.medico_nivel when 'fisio' then c.fisio_nivel when 'base' then c.base_nivel else c.estadio_nivel end;
      v_falta := coalesce((v_alvo ->> v_estr)::int, 0) - coalesce(v_nivel, case when v_estr = 'estadio' then 1 else 0 end);
      if v_falta > v_melhor_falta then v_melhor := v_estr; v_melhor_falta := v_falta; end if;
    end loop;
    continue when v_melhor is null;
    v_nivel := 1 + coalesce(case v_melhor when 'ct' then c.ct_nivel when 'medico' then c.medico_nivel when 'fisio' then c.fisio_nivel when 'base' then c.base_nivel else c.estadio_nivel end,
                            case when v_melhor = 'estadio' then 1 else 0 end);
    v_custo := custo_da_obra(v_melhor, v_nivel);
    select caixa into v_caixa from financas where clube_id = c.id;
    v_reserva := 0.40 * teto_do_clube(c.id); -- 25% de reserva + 15% guardados para um reforço na janela
    continue when coalesce(v_caixa, 0) - v_custo < v_reserva;
    update financas set caixa = caixa - v_custo where clube_id = c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: ' || v_melhor || ' para o nível ' || v_nivel);
    insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
      values (c.id, v_melhor, v_nivel, v_custo, prazo_da_obra(v_nivel), prazo_da_obra(v_nivel));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.bots_investem(bigint) from public, anon;
grant execute on function public.bots_investem(bigint) to authenticated, service_role;

-- ---------- 3. mercado entre bots ----------
alter table public.ligas add column if not exists bots_mercado text; -- '<temporada>:<janela>' da última rodada de negócios entre bots

-- Grava os negócios montados pela função "rodada". p_lista: [{ jogador, para, valor, salario }]. Uma vez por janela.
-- Cada negócio é conferido de novo e o que não passa é pulado (os outros continuam). Devolve quantos foram feitos.
create or replace function public.transferir_entre_bots(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_janela text; v_marca text; x record; v_j jogadores%rowtype; v_de clubes%rowtype; v_para clubes%rowtype;
  v_caixa int; v_folha int; v_teto int; v_adultos int; v_resta int; n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  v_janela := janela_do_mercado(p_liga);
  if v_janela is null then return 0; end if;
  v_marca := v_l.temporada || ':' || v_janela;
  if v_l.bots_mercado is not distinct from v_marca then return 0; end if; -- esta janela já teve a rodada de negócios
  update ligas set bots_mercado = v_marca where id = p_liga;
  for x in select * from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as t(jogador bigint, para bigint, valor int, salario int) loop
    begin
      select * into v_j from jogadores where id = x.jogador for update;
      select * into v_de from clubes where id = v_j.clube_id;
      select * into v_para from clubes where id = x.para;
      continue when v_j.id is null or v_de.id is null or v_para.id is null or v_de.id = v_para.id;
      continue when v_de.dono is not null or v_para.dono is not null or v_de.liga_id <> p_liga or v_para.liga_id <> p_liga;
      continue when v_j.aposenta_em is not null or v_j.salario is null or coalesce(x.valor, 0) <= 0 or coalesce(x.salario, 0) <= 0;
      continue when v_j.idade <= 21; -- jovem não é vendido entre bots
      continue when coalesce(v_de.divisao, 3) < coalesce(v_para.divisao, 3) or coalesce(v_de.divisao, 3) > coalesce(v_para.divisao, 3) + 1; -- o talento só sobe ou fica
      select caixa into v_caixa from financas where clube_id = v_para.id;
      continue when coalesce(v_caixa, 0) - x.valor < 0.25 * teto_do_clube(v_para.id);
      select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_para.id;
      v_teto := teto_do_clube(v_para.id);
      continue when v_folha + x.salario > v_teto or x.salario > 0.15 * v_teto;
      select count(*) into v_resta from jogadores where clube_id = v_de.id and coalesce(juvenil, false) = false;
      continue when v_resta <= 18;
      select count(*) into v_adultos from jogadores where clube_id = v_para.id and idade > 21 and coalesce(juvenil, false) = false;
      continue when v_j.idade > 21 and v_adultos >= 35;
      update financas set caixa = caixa - x.valor where clube_id = v_para.id;
      insert into financas (clube_id, caixa) values (v_de.id, 5000 + x.valor) on conflict (clube_id) do update set caixa = financas.caixa + x.valor;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_para.id, v_l.temporada, null, 'compra', -x.valor, 'Compra: ' || v_j.nome || ' (' || v_de.nome || ')'),
        (v_de.id, v_l.temporada, null, 'venda', x.valor, 'Venda: ' || v_j.nome || ' (' || v_para.nome || ')');
      update jogadores set clube_id = v_para.id, salario = x.salario, salario_mercado = greatest(coalesce(salario_mercado, 0), x.salario),
        contrato_ate = v_l.temporada + 2, protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada, a_venda = false
        where id = v_j.id;
      insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
        values (p_liga, v_l.temporada, v_janela, 'bot', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, x.valor);
      n := n + 1;
    exception when others then null; -- um negócio que esbarra numa regra (limite do elenco, gatilhos) é pulado
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.transferir_entre_bots(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.transferir_entre_bots(bigint, jsonb) to service_role;
