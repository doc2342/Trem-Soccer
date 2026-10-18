-- Trem Soccer · comida e bebida no estádio em dia de jogo (18/10/2026, modelo A).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 117 (refletores e estacionamento). Não exige republicar função.
--
-- Gasto por torcedor = R$ 4 + R$ 0,50 por nível do estádio, vezes 0,8 + 0,4 × humor/16 (torcida brava 0,8×, neutra 1×, em festa 1,2×).
-- Todo o público consome, sócios-torcedores inclusive. Sem os 10% do fundo da liga e sem divisão na copa: vai inteira para o dono do estádio.
-- Manutenção dos bares: 20 mil por nível do estádio por temporada, somada a manutencao_extra_do_estadio (entra em "Manutenção das estruturas").
-- Mesmos números em src/economia.js (COMIDA).
-- lancar_rodada é a do 81, com o lançamento 'comida' a mais.

create or replace function public.comida_por_torcedor(p_nivel int, p_humor numeric) returns numeric language sql immutable as $$
  select round((4 + 0.5 * least(8, greatest(1, coalesce(p_nivel, 1)))) * (0.8 + 0.4 * least(16, greatest(0, coalesce(p_humor, 8))) / 16), 2)
$$;
create or replace function public.manutencao_extra_do_estadio(p_nivel int) returns int language sql immutable as $$
  select case when coalesce(p_nivel, 1) >= 4 then 60 else 0 end + 40 * public.estacionamento_do_estadio(p_nivel)
    + 20 * least(8, greatest(1, coalesce(p_nivel, 1)))
$$;

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
  v_copa boolean; v_vencedor bigint; v_parte int; v_taxa int; v_comida int; v_gasto numeric;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  v_copa := v_p.fase in ('copa', 'lib'); -- a Libertadores divide a renda e mexe no humor como a copa
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
  -- comida e bebida: todo o público consome (sócios também), pelo nível do estádio e pelo humor de antes do jogo; fica toda com o dono do estádio
  v_gasto := comida_por_torcedor(v_c.estadio_nivel, v_c.humor);
  v_comida := round(v_publico * v_gasto / 1000.0);

  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    v_total := 0;
    if v_liga then
      v_folha := round(folha_do_clube(v_clube)::numeric / v_l.rodadas_por_temporada);
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
    if v_clube = v_p.casa and v_comida > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'comida', v_comida,
          'Comida e bebida (' || v_publico || ' torcedores, R$ ' || replace(to_char(v_gasto, 'FM990.00'), '.', ',') || ' por cabeça)');
      v_total := v_total + v_comida;
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

