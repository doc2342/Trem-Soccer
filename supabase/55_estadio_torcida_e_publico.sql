-- Trem Soccer · estádio até 60 mil lugares, torcida que cresce com a história do clube, público que depende do jogo
-- e ingresso mais caro em copa e playoff.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 53_fundo_da_liga.sql já executado. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Estádio: os níveis 1 a 5 seguem iguais (10 a 30 mil lugares); entram os níveis 6, 7 e 8 (40, 50 e 60 mil), para todas as divisões.
--   Obra: 12, 20 e 30 mi; prazo de 22, 27 e 36 rodadas de liga. O estádio passa a ter manutenção: 2% do que já foi gasto nele, por temporada.
-- Torcida: cada clube tem um fator de prestígio (1 a 2,15) que multiplica a torcida-base da divisão. A torcida continua oscilando entre
--   80% e 140% dessa base; com o fator no máximo, um clube da Série A chega a 60 mil. O fator muda uma vez por temporada, depois da virada
--   (a página do administrador chama atualizar_torcidas): Série A +0,03 (campeão +0,10 a mais); Série B: campeão +0,03, os demais -0,02;
--   Série C: campeão fica igual, os demais -0,04; Copa do Brasil: campeão +0,08, vice +0,03. Nunca abaixo de 1.
-- Público de cada jogo: a conta de sempre (torcida, humor, sorteio e 10% da torcida visitante) vezes a atração do jogo:
--   adversário (torcida e humor do visitante): de 85% a 125%; playoff: 125%; copa: 80% na preliminar, 90% na fase de 32, 100% nas oitavas,
--   115% nas quartas, 130% na semifinal e 150% na final; três últimas rodadas da liga: mais 10%.
-- Ingresso: playoff, semifinal +25% e final +50%; copa, oitavas +15%, quartas +30%, semifinal +50% e final o dobro.

alter table public.clubes add column if not exists torcida_fator numeric(4,2) not null default 1; -- prestígio: multiplica a torcida-base da divisão
alter table public.clubes add column if not exists torcida_fator_temporada int;                   -- última temporada em que o fator foi atualizado

create or replace function public.lugares_do_estadio(p_nivel int) returns int language sql immutable as $$
  select case when coalesce(p_nivel, 1) <= 5 then 5000 + 5000 * greatest(1, coalesce(p_nivel, 1)) else (array[40000, 50000, 60000])[least(8, p_nivel) - 5] end
$$;
create or replace function public.base_da_torcida(p_clube bigint) returns numeric language sql stable set search_path = public as $$
  select coalesce((select d.torcida_base from divisoes d where d.liga_id = c.liga_id and d.divisao = c.divisao), l.torcida_base, 10000) * coalesce(c.torcida_fator, 1)
    from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube
$$;

-- ---------- obras do estádio ----------
create or replace function public.custo_da_obra(p_estrutura text, p_nivel int) returns int language sql immutable as $$
  select case when p_estrutura = 'estadio' then (array[null, 1500, 3000, 5000, 8000, 12000, 20000, 30000])[p_nivel]
              else (array[250, 500, 1000, 2000, 4000])[p_nivel] end
$$;
create or replace function public.prazo_da_obra(p_nivel int) returns int language sql immutable as $$
  select (array[1, 3, 6, 11, 18, 22, 27, 36])[p_nivel]
$$;
-- Manutenção por temporada: 10% do que já foi gasto nas quatro estruturas, mais 2% do que já foi gasto no estádio.
create or replace function public.manutencao_por_temporada(p_clube bigint) returns int language sql stable set search_path = public as $$
  select (round(0.10 * (select coalesce(sum((array[0, 250, 750, 1750, 3750, 7750])[n + 1]), 0)
      from clubes c, unnest(array[c.ct_nivel, c.medico_nivel, c.fisio_nivel, c.base_nivel]) n where c.id = p_clube))
    + round(0.02 * coalesce((select (array[0, 1500, 4500, 9500, 17500, 29500, 49500, 79500])[least(8, greatest(1, c.estadio_nivel))] from clubes c where c.id = p_clube), 0)))::int
$$;

create or replace function public.iniciar_obra(p_estrutura text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_nivel int; v_custo int; v_caixa int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_estrutura not in ('ct', 'medico', 'fisio', 'base', 'estadio') then raise exception 'Estrutura desconhecida.'; end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida) then raise exception 'Já existe uma obra em andamento. Só cabe uma por vez.'; end if;
  v_nivel := 1 + case p_estrutura when 'ct' then v_c.ct_nivel when 'medico' then v_c.medico_nivel when 'fisio' then v_c.fisio_nivel
    when 'base' then v_c.base_nivel else v_c.estadio_nivel end;
  if v_nivel > (case when p_estrutura = 'estadio' then 8 else 5 end) then raise exception 'Essa estrutura já está no nível máximo.'; end if;
  v_custo := custo_da_obra(p_estrutura, v_nivel);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo then raise exception 'Caixa insuficiente: a obra custa % mil e o caixa é de % mil.', v_custo, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: ' || p_estrutura || ' para o nível ' || v_nivel);
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, p_estrutura, v_nivel, v_custo, prazo_da_obra(v_nivel), prazo_da_obra(v_nivel));
end $$;
revoke execute on function public.iniciar_obra(text) from public, anon;
grant execute on function public.iniciar_obra(text) to authenticated;

-- ---------- atração e preço de cada jogo ----------
create or replace function public.atracao_do_jogo(p_partida bigint) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_p partidas%rowtype; v_f clubes%rowtype; v_l ligas%rowtype; v_base numeric; v_adv numeric; v_comp numeric; v_fim numeric := 1;
begin
  select * into v_p from partidas where id = p_partida;
  if v_p.id is null then return 1; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_f from clubes where id = v_p.fora;
  v_base := (select coalesce((select d.torcida_base from divisoes d where d.liga_id = c.liga_id and d.divisao = c.divisao), v_l.torcida_base, 10000) from clubes c where c.id = v_p.casa);
  -- adversário: 100% contra um visitante com a torcida-base da divisão do mandante e humor médio
  v_adv := least(1.25, greatest(0.85, 0.9 + 0.25 * (coalesce(v_f.torcida, v_base) / greatest(1, v_base) - 0.6) + 0.0125 * (coalesce(v_f.humor, 8) - 8)));
  v_comp := case when v_p.fase = 'copa' then (array[0.8, 0.9, 1.0, 1.15, 1.3, 1.5])[least(6, greatest(1, coalesce(v_p.copa_fase, 1)))]
                 when v_p.fase <> 'liga' then 1.25 else 1 end;
  if v_p.fase = 'liga' and v_p.rodada > coalesce(v_l.rodadas_por_temporada, 18) - 3 then v_fim := 1.1; end if;
  return v_adv * v_comp * v_fim;
end $$;
revoke execute on function public.atracao_do_jogo(bigint) from public;
grant execute on function public.atracao_do_jogo(bigint) to anon, authenticated, service_role;

create or replace function public.preco_do_jogo(p_partida bigint) returns numeric language sql stable set search_path = public as $$
  select case when p.fase = 'copa' then (array[1, 1, 1.15, 1.3, 1.5, 2])[least(6, greatest(1, coalesce(p.copa_fase, 1)))]
              when p.fase = 'liga' then 1 when p.rodada >= 20 then 1.5 else 1.25 end
    from partidas p where p.id = p_partida
$$;

create or replace function public.definir_publico(p_partida bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype; v_l ligas%rowtype; v_c clubes%rowtype;
  v_lugares int; v_carne int; v_publico int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null then return null; end if;
  if v_p.publico is not null then return v_p.publico; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_c from clubes where id = v_p.casa;
  v_lugares := lugares_do_estadio(v_c.estadio_nivel);
  v_carne := case when v_p.fase = 'liga' and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  v_publico := least(v_lugares, greatest(v_carne,
    round((v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)) * atracao_do_jogo(p_partida))));
  update partidas set publico = v_publico where id = p_partida;
  return v_publico;
end $$;
revoke execute on function public.definir_publico(bigint) from public, anon;
grant execute on function public.definir_publico(bigint) to authenticated, service_role;

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
  if v_c.carne_temporada is not distinct from v_l.temporada then raise exception 'O Sócio-Torcedor desta temporada já foi aberto.'; end if;
  if exists (select 1 from partidas where liga_id = v_c.liga_id and processada) then raise exception 'A temporada já começou: o Sócio-Torcedor só abre antes da primeira rodada.'; end if;
  if p_lugares is null or p_lugares < 0 then raise exception 'Número de lugares inválido.'; end if;
  v_n := least(p_lugares, v_c.torcida / 3, lugares_do_estadio(v_c.estadio_nivel));
  select coalesce((select preco_ingresso from divisoes where liga_id = v_c.liga_id and divisao = v_c.divisao), v_l.preco_ingresso) into v_preco;
  v_valor := round(v_n * v_preco * 0.8 * (v_l.rodadas_por_temporada / 2) / 1000.0);
  update clubes set carne = v_n, carne_temporada = v_l.temporada where id = v_c.id;
  if v_valor > 0 then
    update financas set caixa = caixa + v_valor where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_l.temporada, null, 'carne', v_valor, 'Sócio-Torcedor (' || v_n || ' sócios)');
  end if;
  return v_valor;
end $$;
revoke execute on function public.definir_carne(int) from public, anon;
grant execute on function public.definir_carne(int) to authenticated;

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
  v_copa boolean; v_vencedor bigint; v_parte int; v_taxa int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  v_copa := v_p.fase = 'copa';
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

  -- público: o sócio-torcedor já pagou e ocupa o lugar; os demais compram ingresso se houver lugar
  v_lugares := lugares_do_estadio(v_c.estadio_nivel);
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  -- se o público já foi definido no início da partida (definir_publico), vale ele
  v_publico := coalesce(v_p.publico, least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)))));
  v_avulsos := v_publico - v_carne;
  v_bilheteria := round(v_avulsos * v_d.preco_ingresso * preco_do_jogo(p_partida) / 1000.0); -- copa e playoff têm ingresso mais caro
  -- 10% da bilheteria de todo jogo vão para o fundo da liga, que paga os prêmios da copa
  v_taxa := round(v_bilheteria * 0.10);
  v_bilheteria := v_bilheteria - v_taxa;
  if v_taxa > 0 then
    perform set_config('trem.fundo', 'bilheteria', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) + v_taxa where id = v_p.liga_id;
    perform set_config('trem.fundo', '', true);
  end if;
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
    if v_copa then
      -- copa: a renda do jogo é dividida meio a meio (o centavo que sobra fica com o dono do estádio)
      v_parte := case when v_clube = v_p.casa then v_bilheteria - v_bilheteria / 2 else v_bilheteria / 2 end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_parte,
          'Bilheteria da copa, metade de ' || v_bilheteria || ' mil, já sem os 10% do fundo da liga (' || v_publico || ' pagantes' || case when v_clube = v_p.casa then ', no seu estádio' else ', no estádio do adversário' end || ')');
      v_total := v_total + v_parte;
    elsif v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria,
          'Bilheteria (' || v_avulsos || ' pagantes' || case when v_carne > 0 then ' e ' || v_carne || ' sócios-torcedores' else '' end || ', já sem os 10% do fundo da liga)' || case when v_liga then '' else ' · playoff' end);
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
      if v_copa then
        -- campo neutro: sem peso de mando; nos pênaltis, quem passa fica um pouco feliz e quem cai, um pouco triste
        v_vencedor := coalesce(v_p.vencedor, nullif(v_r.relatorio->>'vencedor', '')::bigint);
        if v_saldo = 0 and v_vencedor is not null then
          if v_vencedor = v_clube then v_dh := 0.5; v_dt := 0.005; else v_dh := -0.5; v_dt := -0.005; end if;
        elsif v_saldo > 0 then v_dh := 1; v_dt := 0.01;
        elsif v_saldo = 0 then v_dh := 0; v_dt := 0;
        else v_dh := -0.8; v_dt := -0.01;
        end if;
      elsif v_saldo > 0 then v_dh := 1; v_dt := 0.01;
      elsif v_saldo = 0 then v_dh := case when v_clube = v_p.casa then -0.3 else 0.2 end; v_dt := 0;
      else v_dh := case when v_clube = v_p.casa then -1 else -0.7 end; v_dt := -0.01;
      end if;
      update clubes set
        humor = least(16, greatest(0, humor + v_dh + (8 - humor) * 0.05)),
        torcida = least(round(base_da_torcida(id) * 1.4), greatest(round(base_da_torcida(id) * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;

-- ---------- prestígio: uma vez por temporada, depois da virada ----------
create or replace function public.atualizar_torcidas(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  update clubes c set torcida_fator_temporada = v_t,
      torcida_fator = least(2.15, greatest(1, c.torcida_fator
        + case h.divisao when 1 then 0.03 + case when h.posicao = 1 then 0.10 else 0 end
                         when 2 then case when h.posicao = 1 then 0.03 else -0.02 end
                         else case when h.posicao = 1 then 0 else -0.04 end end
        + case h.copa when 'campeão' then 0.08 when 'vice' then 0.03 else 0 end))
    from historico h
    where h.liga_id = p_liga and h.temporada = v_t - 1 and h.clube_id = c.id and c.torcida_fator_temporada is distinct from v_t;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.atualizar_torcidas(bigint) from public, anon;
grant execute on function public.atualizar_torcidas(bigint) to authenticated, service_role;

-- reiniciar o teste (a temporada volta) devolve o prestígio de todos a 1
create or replace function public.reiniciar_prestigio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.temporada < old.temporada then update clubes set torcida_fator = 1, torcida_fator_temporada = null where liga_id = new.id; end if;
  return null;
end $$;
drop trigger if exists ligas_reiniciar_prestigio on public.ligas;
create trigger ligas_reiniciar_prestigio after update of temporada on public.ligas for each row execute function public.reiniciar_prestigio();
