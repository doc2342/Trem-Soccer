-- Trem Soccer · fase 2, passo E5: carnê, clube no vermelho, imposto sobre o lucro e fundo da liga.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 17_acesso_e_descenso.sql já executado. Não exige publicar a função "rodada" de novo.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.
-- Enquanto o calendário é de teste, o prazo do clube no vermelho corre em rodadas de liga (2 semanas = 3 rodadas).

alter table public.clubes add column if not exists carne int not null default 0;              -- lugares vendidos em carnê nesta temporada
alter table public.clubes add column if not exists carne_temporada int;                       -- temporada em que o carnê foi vendido
alter table public.clubes add column if not exists vermelho_rodadas smallint not null default 0; -- rodadas seguidas abaixo do limite da dívida
alter table public.clubes add column if not exists premio_antecipado int not null default 0;  -- valor a descontar do prêmio na virada
alter table public.clubes add column if not exists antecipou_temporada int;                   -- a antecipação é uma vez por temporada
alter table public.ligas add column if not exists fundo_taca int not null default 0;          -- metade do imposto, guardada para a segunda taça

-- Menor prêmio da divisão (o do lanterna): é o que o clube pode antecipar.
create or replace function public.premio_minimo(p_divisao int) returns int language sql immutable as $$
  select (array[4000, 2400, 1200])[least(3, greatest(1, p_divisao))]
$$;

-- ---------- carnê de temporada ----------
-- Antes da primeira rodada, o dirigente libera lugares para carnê: até um terço da torcida compra, com 20% de desconto,
-- pagando de uma vez os jogos em casa da temporada. Quem tem carnê ocupa o lugar em todos os jogos em casa.
create or replace function public.definir_carne(p_lugares int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_preco int; v_n int; v_valor int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if v_c.carne_temporada is not distinct from v_l.temporada then raise exception 'Os carnês desta temporada já foram vendidos.'; end if;
  if exists (select 1 from partidas where liga_id = v_c.liga_id and processada) then raise exception 'A temporada já começou: o carnê só é vendido antes da primeira rodada.'; end if;
  if p_lugares is null or p_lugares < 0 then raise exception 'Número de lugares inválido.'; end if;
  v_n := least(p_lugares, v_c.torcida / 3, 5000 + 5000 * v_c.estadio_nivel);
  select coalesce((select preco_ingresso from divisoes where liga_id = v_c.liga_id and divisao = v_c.divisao), v_l.preco_ingresso) into v_preco;
  v_valor := round(v_n * v_preco * 0.8 * (v_l.rodadas_por_temporada / 2) / 1000.0);
  update clubes set carne = v_n, carne_temporada = v_l.temporada where id = v_c.id;
  if v_valor > 0 then
    update financas set caixa = caixa + v_valor where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_l.temporada, null, 'carne', v_valor, 'Carnês da temporada (' || v_n || ' lugares)');
  end if;
  return v_valor;
end $$;
revoke execute on function public.definir_carne(int) from public, anon;
grant execute on function public.definir_carne(int) to authenticated;

-- ---------- clube no vermelho ----------
-- Venda de um jogador ao banco do jogo por 60% da cláusula (3 vezes o salário). Só com o caixa negativo e sem deixar o elenco com menos de 16.
create or replace function public.vender_ao_banco(p_jogador bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_caixa int; v_valor int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) >= 0 then raise exception 'A venda ao banco só existe para sair do vermelho, e o seu caixa não está negativo.'; end if;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  v_valor := 3 * coalesce(v_j.salario, 0);
  delete from jogadores where id = p_jogador;
  update financas set caixa = caixa + v_valor where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, (select temporada from ligas where id = v_c.liga_id), null, 'banco', v_valor, 'Venda ao banco: ' || v_j.nome);
  return v_valor;
end $$;
revoke execute on function public.vender_ao_banco(bigint) from public, anon;
grant execute on function public.vender_ao_banco(bigint) to authenticated;

-- Antecipação do prêmio: recebe agora 80% do menor prêmio da divisão; o valor cheio é descontado do prêmio na virada. Uma vez por temporada.
create or replace function public.antecipar_premio() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_caixa int; v_base int; v_valor int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) >= 0 then raise exception 'A antecipação só existe para sair do vermelho, e o seu caixa não está negativo.'; end if;
  if v_c.antecipou_temporada is not distinct from v_l.temporada then raise exception 'O prêmio desta temporada já foi antecipado.'; end if;
  v_base := premio_minimo(v_c.divisao);
  v_valor := round(v_base * 0.8);
  update clubes set premio_antecipado = v_base, antecipou_temporada = v_l.temporada where id = v_c.id;
  update financas set caixa = caixa + v_valor where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'antecipacao', v_valor, 'Prêmio antecipado (com 20% de desconto)');
  return v_valor;
end $$;
revoke execute on function public.antecipar_premio() from public, anon;
grant execute on function public.antecipar_premio() to authenticated;

-- Sem escolha no prazo: o jogo vende ao banco o maior salário fora dos 11 da tática salva (ou, sem tática, fora do grupo titular),
-- e repete até o caixa sair do negativo ou o elenco chegar a 16.
create or replace function public.venda_forcada(p_clube bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_caixa int; v_n int := 0; v_temp int;
begin
  select l.temporada into v_temp from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube;
  loop
    select caixa into v_caixa from financas where clube_id = p_clube;
    exit when coalesce(v_caixa, 0) >= 0 or (select count(*) from jogadores where clube_id = p_clube) <= 16;
    select j.* into v_j from jogadores j where j.clube_id = p_clube and coalesce(j.salario, 0) > 0
      and case when exists (select 1 from taticas t where t.clube_id = p_clube and jsonb_typeof(t.dados->'jog') = 'array')
            then not exists (select 1 from taticas t, jsonb_array_elements_text(t.dados->'jog') x where t.clube_id = p_clube and x = 'j' || j.id)
            else not j.principal end
      order by j.salario desc, j.id limit 1;
    exit when v_j.id is null;
    delete from jogadores where id = v_j.id;
    update financas set caixa = caixa + 3 * v_j.salario where clube_id = p_clube;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (p_clube, v_temp, null, 'banco', 3 * v_j.salario, 'Venda forçada ao banco: ' || v_j.nome);
    v_n := v_n + 1;
  end loop;
  update clubes set vermelho_rodadas = 0 where id = p_clube;
  return v_n;
end $$;
revoke execute on function public.venda_forcada(bigint) from public, anon, authenticated;

-- Contratos: com o caixa negativo, aumentos e renovações ficam bloqueados.
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) < 0 then raise exception 'Com o caixa negativo, aumentos e renovações ficam bloqueados.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  v_teto := teto_do_clube(v_c.id);
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas > 0 and p_salario < v_j.salario_mercado then raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_c.id;
  if v_folha - v_j.salario + p_salario > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_teto;
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
end $$;

-- ---------- lançamentos da partida, agora com carnê e com o prazo do clube no vermelho ----------
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_r resultados%rowtype;
  v_c clubes%rowtype;
  v_d divisoes%rowtype;
  v_o obras%rowtype;
  v_clube bigint;
  v_tv int; v_pat int; v_folha int; v_manut int; v_total int; v_extra int;
  v_publico int; v_bilheteria int; v_lugares int; v_carne int; v_avulsos int;
  v_saldo int; v_dh numeric; v_dt numeric;
  v_liga boolean; v_caixa int; v_n int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_r from resultados where partida_id = p_partida;
  select * into v_c from clubes where id = v_p.casa;
  select * into v_d from divisoes where liga_id = v_p.liga_id and divisao = v_c.divisao;
  if v_d.liga_id is null then
    v_d.receita_tv := v_l.receita_tv; v_d.receita_patrocinio := v_l.receita_patrocinio;
    v_d.preco_ingresso := v_l.preco_ingresso; v_d.torcida_base := v_l.torcida_base;
  end if;
  v_tv := round(v_d.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_d.receita_patrocinio::numeric / v_l.rodadas_por_temporada);

  -- público: quem tem carnê já pagou e ocupa o lugar; os demais compram ingresso se houver lugar
  v_lugares := 5000 + 5000 * v_c.estadio_nivel;
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  v_publico := least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora))));
  v_avulsos := v_publico - v_carne;
  v_bilheteria := round(v_avulsos * v_d.preco_ingresso / 1000.0);
  update partidas set publico = v_publico where id = p_partida;

  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    v_total := 0;
    if v_liga then
      select round(coalesce(sum(salario), 0)::numeric / v_l.rodadas_por_temporada) into v_folha from jogadores where clube_id = v_clube;
      v_manut := round(manutencao_por_temporada(v_clube)::numeric / v_l.rodadas_por_temporada);
      v_total := v_tv + v_pat - v_folha - v_manut;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_clube, v_l.temporada, v_p.rodada, 'tv', v_tv, 'Cota de TV'),
        (v_clube, v_l.temporada, v_p.rodada, 'patrocinio', v_pat, 'Patrocínio'),
        (v_clube, v_l.temporada, v_p.rodada, 'salarios', -v_folha, 'Salários dos jogadores');
      if v_manut > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'manutencao', -v_manut, 'Manutenção das estruturas');
      end if;
      select round(greatest(0, (select receita_tv from divisoes where liga_id = v_p.liga_id and divisao = c.divisao - 1) - v_d.receita_tv)::numeric / 2 / v_l.rodadas_por_temporada)
        into v_extra from clubes c where c.id = v_clube and c.paraquedas = v_l.temporada;
      if coalesce(v_extra, 0) > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'paraquedas', v_extra, 'Paraquedas de TV');
        v_total := v_total + v_extra;
      end if;
    end if;
    if v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria,
          'Bilheteria (' || v_avulsos || ' pagantes' || case when v_carne > 0 then ' e ' || v_carne || ' de carnê' else '' end || ')' || case when v_liga then '' else ' · playoff' end);
      v_total := v_total + v_bilheteria;
    end if;
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)
      on conflict (clube_id) do update set caixa = financas.caixa + v_total;

    if v_liga then
      select * into v_o from obras where clube_id = v_clube and not concluida;
      if v_o.id is not null then
        if v_o.rodadas_restantes <= 1 then
          update obras set rodadas_restantes = 0, concluida = true where id = v_o.id;
          update clubes set
            ct_nivel = case when v_o.estrutura = 'ct' then v_o.nivel_alvo else ct_nivel end,
            medico_nivel = case when v_o.estrutura = 'medico' then v_o.nivel_alvo else medico_nivel end,
            fisio_nivel = case when v_o.estrutura = 'fisio' then v_o.nivel_alvo else fisio_nivel end,
            base_nivel = case when v_o.estrutura = 'base' then v_o.nivel_alvo else base_nivel end,
            estadio_nivel = case when v_o.estrutura = 'estadio' then v_o.nivel_alvo else estadio_nivel end
          where id = v_clube;
        else
          update obras set rodadas_restantes = rodadas_restantes - 1 where id = v_o.id;
        end if;
      end if;

      -- clube no vermelho: abaixo de 10% do teto no negativo, o prazo corre; na terceira rodada seguida, o jogo vende ao banco
      select caixa into v_caixa from financas where clube_id = v_clube;
      if v_caixa < -0.10 * teto_do_clube(v_clube) then
        update clubes set vermelho_rodadas = vermelho_rodadas + 1 where id = v_clube returning vermelho_rodadas into v_n;
        if v_n >= 3 then perform venda_forcada(v_clube); end if;
      else
        update clubes set vermelho_rodadas = 0 where id = v_clube and vermelho_rodadas <> 0;
      end if;
    end if;

    if v_r.partida_id is not null then
      v_saldo := case when v_clube = v_p.casa then v_r.gols_casa - v_r.gols_fora else v_r.gols_fora - v_r.gols_casa end;
      if v_saldo > 0 then v_dh := 1; v_dt := 0.01;
      elsif v_saldo = 0 then v_dh := case when v_clube = v_p.casa then -0.3 else 0.2 end; v_dt := 0;
      else v_dh := case when v_clube = v_p.casa then -1 else -0.7 end; v_dt := -0.01;
      end if;
      update clubes set
        humor = least(16, greatest(0, humor + v_dh + (8 - humor) * 0.05)),
        torcida = least(round(v_d.torcida_base * 1.4), greatest(round(v_d.torcida_base * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;

-- ---------- imposto sobre o lucro e fundo da liga ----------
-- 20% do lucro da temporada que passar de um quarto do teto de folha do clube.
create or replace function public.imposto_do_lucro(p_lucro int, p_teto int) returns int language sql immutable as $$
  select greatest(0, round(0.20 * (p_lucro - p_teto / 4.0)))::int
$$;
-- Para a prévia da virada: lucro de cada clube na temporada até agora (sem o prêmio, que ainda não foi pago). Só administrador.
create or replace function public.lucros_da_temporada(p_liga bigint) returns table (clube_id bigint, lucro int, teto int, antecipado int)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce((select sum(valor) from lancamentos x where x.clube_id = c.id and x.temporada = l.temporada), 0)::int,
    teto_do_clube(c.id), c.premio_antecipado
  from clubes c join ligas l on l.id = c.liga_id
  where c.liga_id = p_liga and public.eh_admin()
$$;
revoke execute on function public.lucros_da_temporada(bigint) from public, anon;
grant execute on function public.lucros_da_temporada(bigint) to authenticated;

-- Virada com E5: desconta o prêmio antecipado, cobra o imposto, e distribui o fundo (metade para a terceira divisão da
-- temporada que começa, metade guardada para a segunda taça). Carnê e antecipação valem só para a temporada que acabou.
create or replace function public.virar_temporada(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype;
  r record;
  v_id bigint;
  v_premios int; v_apos int; v_novos int := 0; v_mov int := 0; v_imposto int; v_terceira int; v_cota int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vira a temporada.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null then raise exception 'Liga não encontrada.'; end if;
  if (p_plano->>'temporada')::int is distinct from v_l.temporada then raise exception 'Este plano é de outra temporada. Prepare a virada de novo.'; end if;
  if not exists (select 1 from partidas where liga_id = p_liga) then raise exception 'Não há partidas nesta temporada.'; end if;
  if exists (select 1 from partidas where liga_id = p_liga and (not processada or fim > now())) then
    raise exception 'A temporada ainda não acabou: há partidas por calcular ou em transmissão.';
  end if;

  -- 1. histórico e prêmios
  insert into historico (liga_id, temporada, clube_id, divisao, grupo, posicao, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, premio, destino)
    select p_liga, v_l.temporada, x.clube_id, x.divisao, x.grupo, x.posicao, x.pontos, x.vitorias, x.empates, x.derrotas, x.gols_pro, x.gols_contra, x.premio, x.destino
    from jsonb_to_recordset(p_plano->'classificacao') as x(clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int, gols_pro int, gols_contra int, premio int, destino text)
    join clubes c on c.id = x.clube_id and c.liga_id = p_liga;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select clube_id, v_l.temporada, null, 'premio', premio, 'Prêmio da liga: ' || posicao || 'º lugar'
    from historico where liga_id = p_liga and temporada = v_l.temporada and premio > 0;
  update financas f set caixa = f.caixa + h.premio from historico h
    where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = f.clube_id;
  select coalesce(sum(premio), 0) into v_premios from historico where liga_id = p_liga and temporada = v_l.temporada;

  -- 2. prêmio antecipado: o valor cheio sai agora
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select id, v_l.temporada, null, 'antecipacao', -premio_antecipado, 'Desconto do prêmio antecipado'
    from clubes where liga_id = p_liga and premio_antecipado > 0;
  update financas f set caixa = f.caixa - c.premio_antecipado from clubes c
    where c.liga_id = p_liga and c.premio_antecipado > 0 and c.id = f.clube_id;

  -- 3. imposto sobre o lucro da temporada (tudo o que entrou menos tudo o que saiu, prêmio incluído)
  v_imposto := 0;
  for r in select c.id, imposto_do_lucro(coalesce((select sum(valor) from lancamentos x where x.clube_id = c.id and x.temporada = v_l.temporada), 0)::int, teto_do_clube(c.id)) as valor
           from clubes c where c.liga_id = p_liga loop
    if r.valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.id, v_l.temporada, null, 'imposto', -r.valor, 'Imposto sobre o lucro da temporada');
      update financas set caixa = caixa - r.valor where clube_id = r.id;
      v_imposto := v_imposto + r.valor;
    end if;
  end loop;

  -- 4. jogadores: quem fica, quem se aposenta, quem chega
  update jogadores j set idade = x.idade, at = array(select jsonb_array_elements_text(x.at)::smallint),
      salario = x.salario, salario_mercado = x.salario_mercado, contrato_ate = x.contrato_ate
    from jsonb_to_recordset(p_plano->'jogadores') as x(id bigint, idade int, at jsonb, salario int, salario_mercado int, contrato_ate int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);
  delete from jogadores where id in (select (jsonb_array_elements_text(p_plano->'aposentados'))::bigint)
    and clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics v_apos = row_count;
  for r in select value as v from jsonb_array_elements(p_plano->'novos') loop
    if not exists (select 1 from clubes where id = (r.v->>'clube_id')::bigint and liga_id = p_liga) then continue; end if;
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    v_novos := v_novos + 1;
  end loop;
  update jogadores set amarelos = 0,
      fora_jogos = case when fora_motivo = 'suspensão' then 0 else fora_jogos end,
      fora_motivo = case when fora_motivo = 'suspensão' then null else fora_motivo end
    where clube_id in (select id from clubes where liga_id = p_liga);

  -- 5. acesso e descenso
  update clubes set paraquedas = null, carne = 0, premio_antecipado = 0 where liga_id = p_liga;
  for r in select * from jsonb_to_recordset(coalesce(p_plano->'movimentos', '[]'::jsonb)) as x(clube_id bigint, grupo text, divisao int, caiu boolean) loop
    update clubes c set grupo = r.grupo, divisao = r.divisao,
        paraquedas = case when r.caiu then v_l.temporada + 1 else null end,
        torcida = round(c.torcida::numeric
          * (select torcida_base from divisoes where liga_id = p_liga and divisao = r.divisao)
          / greatest(1, (select torcida_base from divisoes where liga_id = p_liga and divisao = c.divisao)))
      where c.id = r.clube_id and c.liga_id = p_liga;
    v_mov := v_mov + 1;
  end loop;

  -- 6. fundo da liga: metade do imposto vai, por igual, para os clubes da terceira divisão da temporada que começa;
  --    a outra metade fica guardada para a segunda taça
  select count(*) into v_terceira from clubes where liga_id = p_liga and divisao = 3;
  v_cota := case when v_terceira > 0 then (v_imposto / 2) / v_terceira else 0 end;
  if v_cota > 0 then
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select id, v_l.temporada + 1, null, 'fundo', v_cota, 'Fundo da liga (imposto da temporada ' || v_l.temporada || ')'
      from clubes where liga_id = p_liga and divisao = 3;
    update financas f set caixa = f.caixa + v_cota from clubes c where c.liga_id = p_liga and c.divisao = 3 and c.id = f.clube_id;
  end if;

  delete from partidas where liga_id = p_liga;
  update ligas set temporada = temporada + 1, fundo_taca = fundo_taca + (v_imposto - v_cota * v_terceira) where id = p_liga;
  return 'Temporada ' || v_l.temporada || ' encerrada: ' || v_premios || ' mil em prêmios, ' || v_imposto || ' mil de imposto (' || v_cota
    || ' mil para cada clube da terceira divisão), ' || v_mov || ' clubes mudam de divisão, ' || v_apos || ' aposentados e ' || v_novos
    || ' jovens. Começa a temporada ' || (v_l.temporada + 1) || '.';
end $$;
revoke execute on function public.virar_temporada(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada(bigint, jsonb) to authenticated;

-- ---------- reinício do teste: também zera carnê, dívida, antecipação, paraquedas e fundo ----------
create or replace function public.reiniciar_teste(p_liga bigint, p_sortear boolean default true) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_e estado_inicial%rowtype;
  v_grupos text[];
  v_g text; v_alvo text; v_bot bigint;
  r record;
  n int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador reinicia o teste.'; end if;
  select * into v_e from estado_inicial where liga_id = p_liga;
  if v_e.liga_id is null then raise exception 'Não há estado inicial guardado para esta liga.'; end if;

  delete from partidas where liga_id = p_liga;
  delete from historico where liga_id = p_liga;
  delete from lancamentos where clube_id in (select id from clubes where liga_id = p_liga);
  delete from obras where clube_id in (select id from clubes where liga_id = p_liga);

  delete from jogadores where clube_id in (select id from clubes where liga_id = p_liga);
  insert into jogadores overriding system value
    select * from jsonb_populate_recordset(null::jogadores,
      (select jsonb_agg(x || '{"fora_jogos": 0, "fora_motivo": null, "amarelos": 0}'::jsonb) from jsonb_array_elements(v_e.jogadores) x));
  insert into jogadores_ocultos select * from jsonb_populate_recordset(null::jogadores_ocultos, v_e.ocultos);

  if p_sortear then
    select array_agg(g order by g) into v_grupos from (select distinct grupo g from clubes where liga_id = p_liga) x;
    for r in select id from clubes where liga_id = p_liga and dono is not null order by random() loop
      v_alvo := v_grupos[n % array_length(v_grupos, 1) + 1];
      n := n + 1;
      select grupo into v_g from clubes where id = r.id;
      if v_g <> v_alvo then
        select id into v_bot from clubes where liga_id = p_liga and grupo = v_alvo and dono is null order by random() limit 1;
        if v_bot is not null then
          update clubes set grupo = v_g where id = v_bot;
          update clubes set grupo = v_alvo where id = r.id;
        end if;
      end if;
    end loop;
  end if;

  update clubes c set divisao = divisao_do_grupo(c.grupo), estadio_nivel = 1, humor = 8,
    ct_nivel = 0, medico_nivel = 0, fisio_nivel = 0, base_nivel = 0,
    paraquedas = null, carne = 0, carne_temporada = null, vermelho_rodadas = 0, premio_antecipado = 0, antecipou_temporada = null,
    torcida = (select d.torcida_base from divisoes d where d.liga_id = p_liga and d.divisao = divisao_do_grupo(c.grupo))
  where c.liga_id = p_liga;
  insert into financas (clube_id, caixa) select id, 5000 from clubes where liga_id = p_liga
    on conflict (clube_id) do update set caixa = 5000;
  update ligas set temporada = v_e.temporada, pausada = false, pausada_em = null, fundo_taca = 0 where id = p_liga;
  return 'Teste reiniciado: ' || jsonb_array_length(v_e.jogadores) || ' jogadores de volta ao estado de ' || to_char(v_e.guardado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.reiniciar_teste(bigint, boolean) from public, anon;
grant execute on function public.reiniciar_teste(bigint, boolean) to authenticated;
