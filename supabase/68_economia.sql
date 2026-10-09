-- Trem Soccer · economia: prêmios da liga pela metade, manutenção das estruturas em dobro, bots ricos investem mais e luvas na renovação.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não precisa republicar função nenhuma
-- (o prêmio da liga é calculado pela página do administrador, que já sai com os valores novos). Pode ser executado mais de uma vez.
--
-- Por quê: os clubes juntavam de 6 a 8 mi por temporada (prêmios de até 10 mi e o teto de folha travando o gasto com salário),
-- e o caixa médio da Série A (34 mi) passou o do fundo da liga (33 mi).
-- 1. Prêmio da liga pela metade: A de 5 a 2 mi, B de 3 a 1,2 mi, C de 1,75 a 0,6 mi (src/virada.js). O prêmio que dá para antecipar
--    (o do lanterna) cai junto. Quem já antecipou nesta temporada devolve na virada o valor que recebeu, como antes.
-- 2. Manutenção por temporada: 20% do que foi gasto nas quatro estruturas e 4% do que foi gasto no estádio (era 10% e 2%).
--    Continua cobrada rodada a rodada de liga.
-- 3. Bot rico (caixa de 2 tetos de folha ou mais) mira mais alto nas obras: um nível a mais em CT, médico, base e fisioterapia
--    e dois a mais no estádio. Continua uma obra por vez e com 40% do teto de reserva depois de pagar.
-- 4. Luvas: na renovação, o dirigente pode pôr um salário abaixo do pedido (até 70% dele) pagando a diferença de uma vez, do caixa e
--    fora da folha: cada mil a menos por temporada custa 1,5 mil por temporada de contrato. O dinheiro sai do jogo (vai para o jogador).
--    A multa continua pelo valor de hoje do jogador, e o salário não pode ficar abaixo do atual.

-- ---------- 1. prêmio que dá para antecipar ----------
create or replace function public.premio_minimo(p_divisao int) returns int language sql immutable as $$
  select (array[2000, 1200, 600])[least(3, greatest(1, p_divisao))]
$$;

-- ---------- 2. manutenção ----------
create or replace function public.manutencao_por_temporada(p_clube bigint) returns int language sql stable set search_path = public as $$
  select (round(0.20 * (select coalesce(sum((array[0, 250, 750, 1750, 3750, 7750])[n + 1]), 0)
      from clubes c, unnest(array[c.ct_nivel, c.medico_nivel, c.fisio_nivel, c.base_nivel]) n where c.id = p_clube))
    + round(0.04 * coalesce((select (array[0, 1500, 4500, 9500, 17500, 29500, 49500, 79500])[least(8, greatest(1, c.estadio_nivel))] from clubes c where c.id = p_clube), 0)))::int
$$;

-- ---------- 3. bots investem (com alvos maiores para o bot rico) ----------
create or replace function public.bots_investem(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record; v_alvo jsonb; v_estr text; v_nivel int; v_falta int; v_melhor text; v_melhor_falta int; v_custo int; v_caixa int; v_teto int;
  v_rico boolean; v_maximo int; v_l ligas%rowtype; n int := 0;
  c_alvos jsonb := '{"1": {"ct": 3, "medico": 2, "base": 3, "fisio": 2, "estadio": 3}, "2": {"ct": 2, "medico": 1, "base": 2, "fisio": 1, "estadio": 2}, "3": {"ct": 1, "medico": 1, "base": 1, "fisio": 0, "estadio": 1}}';
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.eh_admin()) then raise exception 'Sem permissão.'; end if;
  select * into v_l from ligas where id = p_liga;
  if v_l.id is null or v_l.pausada then return 0; end if;
  for c in select cl.* from clubes cl where cl.liga_id = p_liga and cl.dono is null
             and not exists (select 1 from obras o where o.clube_id = cl.id and not o.concluida) loop
    select caixa into v_caixa from financas where clube_id = c.id;
    v_teto := teto_do_clube(c.id);
    v_rico := coalesce(v_caixa, 0) >= 2 * v_teto; -- bot rico: um nível a mais nas estruturas, dois no estádio
    v_alvo := c_alvos -> least(3, greatest(1, coalesce(c.divisao, 3)))::text;
    v_melhor := null; v_melhor_falta := 0;
    foreach v_estr in array array['ct', 'medico', 'base', 'fisio', 'estadio'] loop
      v_nivel := case v_estr when 'ct' then c.ct_nivel when 'medico' then c.medico_nivel when 'fisio' then c.fisio_nivel when 'base' then c.base_nivel else c.estadio_nivel end;
      v_maximo := case when v_estr = 'estadio' then 8 else 5 end;
      v_falta := least(v_maximo, coalesce((v_alvo ->> v_estr)::int, 0) + case when not v_rico then 0 when v_estr = 'estadio' then 2 else 1 end)
                 - coalesce(v_nivel, case when v_estr = 'estadio' then 1 else 0 end);
      if v_falta > v_melhor_falta then v_melhor := v_estr; v_melhor_falta := v_falta; end if;
    end loop;
    continue when v_melhor is null;
    v_nivel := 1 + coalesce(case v_melhor when 'ct' then c.ct_nivel when 'medico' then c.medico_nivel when 'fisio' then c.fisio_nivel when 'base' then c.base_nivel else c.estadio_nivel end,
                            case when v_melhor = 'estadio' then 1 else 0 end);
    v_custo := custo_da_obra(v_melhor, v_nivel);
    continue when coalesce(v_caixa, 0) - v_custo < 0.40 * v_teto; -- 25% de reserva + 15% guardados para um reforço na janela
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

-- ---------- 4. luvas ----------
-- o contrato progressivo (52_pacote_da_economia.sql) encurta o contrato com salário abaixo do que a duração pede;
-- a renovação com luvas avisa por 'trem.luvas' que o salário menor já foi pago em luvas
create or replace function public.salario_progressivo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_t int; v_n int;
begin
  if coalesce(current_setting('trem.virada', true), '') = '1' then return new; end if;
  if coalesce(current_setting('trem.luvas', true), '') = '1' then return new; end if;
  if new.clube_id is null or new.salario is null or new.contrato_ate is null or coalesce(new.salario_mercado, 0) <= 0 then return new; end if;
  if new.contrato_ate is not distinct from old.contrato_ate and new.clube_id is not distinct from old.clube_id then return new; end if;
  if old.contrato_ate is null and old.clube_id is not distinct from new.clube_id then return new; end if; -- primeiro contrato dado pelo administrador
  select l.temporada into v_t from clubes c join ligas l on l.id = c.liga_id where c.id = new.clube_id;
  if v_t is null then return new; end if;
  v_n := new.contrato_ate - v_t;
  if v_n <= 1 then return new; end if;
  while v_n > 1 and new.salario < round(new.salario_mercado * (1 + 0.1 * (v_n - 1))) loop v_n := v_n - 1; end loop;
  new.contrato_ate := v_t + v_n;
  return new;
end $$;

drop function if exists public.ajustar_contrato(bigint, int, int);
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0, p_com_luvas boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int; v_caixa int; v_pede int; v_luvas int := 0;
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
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_c.id;
  if v_folha - v_j.salario + p_salario > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_teto;
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
revoke execute on function public.ajustar_contrato(bigint, int, int, boolean) from public, anon;
grant execute on function public.ajustar_contrato(bigint, int, int, boolean) to authenticated;
