-- Trem Soccer · Libertadores (países, passo 3).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 80_virada_com_paises.sql já executado. Depois, REPUBLICAR a função "rodada" (ela calcula o jogo de Libertadores como jogo de copa).
-- Pode ser executado mais de uma vez.
--
-- A Libertadores é um mata-mata de 16 clubes em jogo único: os 3 primeiros da Série A, o campeão da Copa do Brasil (ou o 4º da Série A,
-- se o campeão já está entre os três) e os 3 primeiros de cada um dos outros países, pela temporada anterior.
-- A página do administrador cria as oitavas junto com o calendário (os 4 do Brasil contra 4 de fora, por sorteio) e guarda as quatro
-- datas em ligas.copa->'lib'->'datas'. As partidas têm fase 'lib', grupo 'LIB', copa_fase 3 a 6 (oitavas, quartas, semifinal, final:
-- os mesmos números da Copa do Brasil) e rodada 200 + copa_fase. Daí em diante o sorteio de cada fase é livre.
-- Como na copa: estádio maior, sem mando, prorrogação e pênaltis, renda meio a meio e 10% da bilheteria para o fundo da liga.
-- Prêmios, pagos pelo fundo da liga (6 mi no total): 200 mil a quem entra nas quartas, 300 mil a quem entra na semifinal,
-- 700 mil ao vice e 2,5 mi ao campeão, que soma 3 mi.
-- A fase 'lib' é separada da 'copa' de propósito: nada da Copa do Brasil (chave, prêmios, estatísticas) enxerga estes jogos.

alter table public.historico add column if not exists lib text; -- 'campeão' ou 'vice' da Libertadores

-- ---------- o jogo: público, ingresso e caixa iguais aos da copa ----------
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
  v_comp := case when v_p.fase in ('copa', 'lib') then (array[0.8, 0.9, 1.0, 1.15, 1.3, 1.5])[least(6, greatest(1, coalesce(v_p.copa_fase, 1)))]
                 when v_p.fase <> 'liga' then 1.25 else 1 end;
  if v_p.fase = 'liga' and v_p.rodada > coalesce(v_l.rodadas_por_temporada, 18) - 3 then v_fim := 1.1; end if;
  return v_adv * v_comp * v_fim;
end $$;

create or replace function public.preco_do_jogo(p_partida bigint) returns numeric language sql stable set search_path = public as $$
  select case when p.fase in ('copa', 'lib') then (array[1, 1, 1.15, 1.3, 1.5, 2])[least(6, greatest(1, coalesce(p.copa_fase, 1)))]
              when p.fase = 'liga' then 1 when p.rodada >= 20 then 1.5 else 1.25 end
    from partidas p where p.id = p_partida
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
  v_copa boolean; v_vencedor bigint; v_parte int; v_taxa int;
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

-- ---------- sorteio da fase seguinte e prêmios ----------
-- Com a fase atual encerrada (apito final e efeitos gravados): sorteia a seguinte e paga quem entrou nela; depois da final, paga campeão e vice.
create or replace function public.lib_avancar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_fase int; v_ids bigint[]; v_data jsonb; n int := 0; i int; a bigint; b bigint; na int; nb int;
  v_valor int; v_total int := 0; v_vice bigint;
  c_entrada int[] := array[0, 0, 0, 200, 300, 0]; -- ao entrar na fase 4 (quartas) e 5 (semifinal)
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.copa is null or v_l.copa->'lib' is null or v_l.copa->'lib' ? 'campeao' then return 0; end if;
  select max(copa_fase) into v_fase from partidas where liga_id = p_liga and fase = 'lib';
  if v_fase is null then return 0; end if;
  if exists (select 1 from partidas where liga_id = p_liga and fase = 'lib' and copa_fase = v_fase and (not processada or fim > now())) then return 0; end if;
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id
             where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = v_fase and (r.partida_id is null or r.efeitos is not null)) then return 0; end if;
  select array_agg(x.id order by random()) into v_ids from (
    select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = v_fase) x;
  if v_ids is null then return 0; end if;
  if v_fase >= 6 then
    -- final jogada: campeão e vice
    select case when p.casa = v_ids[1] then p.fora else p.casa end into v_vice from partidas p where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = 6 limit 1;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_ids[1], v_l.temporada, 206, 'copa', 2500, 'Libertadores: prêmio de campeão'),
      (v_vice, v_l.temporada, 206, 'copa', 700, 'Libertadores: prêmio de vice-campeão');
    update financas set caixa = caixa + 2500 where clube_id = v_ids[1];
    update financas set caixa = caixa + 700 where clube_id = v_vice;
    v_total := 3200;
    v_l.copa := jsonb_set(v_l.copa, '{lib,campeao}', to_jsonb(v_ids[1]));
  else
    v_data := v_l.copa->'lib'->'datas'->(v_fase - 2); -- datas[0] é a das oitavas (fase 3): a posição v_fase - 2 é a da fase seguinte
    if v_data is null or array_length(v_ids, 1) < 2 then return 0; end if;
    i := 1;
    while i + 1 <= array_length(v_ids, 1) loop
      a := v_ids[i]; b := v_ids[i + 1];
      select estadio_nivel into na from clubes where id = a;
      select estadio_nivel into nb from clubes where id = b;
      if coalesce(nb, 1) > coalesce(na, 1) then a := v_ids[i + 1]; b := v_ids[i]; end if; -- joga no estádio maior; iguais, vale a ordem do sorteio
      insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim)
        values (p_liga, 'LIB', 200 + v_fase + 1, 'lib', v_fase + 1, a, b, (v_data->>'inicio')::timestamptz, (v_data->>'fim')::timestamptz);
      n := n + 1; i := i + 2;
    end loop;
    v_valor := c_entrada[v_fase + 1];
    if v_valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        select x, v_l.temporada, 200 + v_fase + 1, 'copa', v_valor, 'Libertadores: prêmio por chegar ' || case when v_fase + 1 = 4 then 'às quartas' else 'à semifinal' end
          from unnest(v_ids) x;
      update financas set caixa = caixa + v_valor where clube_id = any(v_ids);
      v_total := v_valor * array_length(v_ids, 1);
    end if;
  end if;
  if v_total > 0 then
    -- ponytail: o fundo paga mesmo sem saldo (fica negativo). São 6 mi por temporada contra uma sobra de ~6–7 mi;
    -- se um dia faltar, copiar de copa_premiar a espera pelo saldo.
    perform set_config('trem.fundo', 'lib', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) - v_total, copa = v_l.copa where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return n;
end $$;
revoke execute on function public.lib_avancar(bigint) from public, anon, authenticated;
grant execute on function public.lib_avancar(bigint) to service_role;

-- O que o servidor chama a cada minuto: agora também a Libertadores.
create or replace function public.copa_avancar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  n := copa_sortear(p_liga);
  perform copa_premiar(p_liga);
  perform lib_avancar(p_liga);
  return n;
end $$;
revoke execute on function public.copa_avancar(bigint) from public, anon;
grant execute on function public.copa_avancar(bigint) to authenticated, service_role;

-- ---------- a virada anota campeão e vice da Libertadores no histórico ----------
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_texto text; v_temporada int; v_copa jsonb; v_super bigint; v_lib_c bigint; v_lib_v bigint;
begin
  select temporada into v_temporada from ligas where id = p_liga;
  v_copa := copa_campanhas(p_liga); -- antes da virada, que apaga as partidas
  select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) into v_super
    from partidas p join resultados r on r.partida_id = p.id
    where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = 0 limit 1;
  select x.v, case when x.v = x.casa then x.fora else x.casa end into v_lib_c, v_lib_v from (
    select p.casa, p.fora, coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as v
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = 6 limit 1) x;
  perform set_config('trem.virada', '1', true);
  perform devolver_emprestados(p_liga); -- o plano da virada já foi montado com cada emprestado no clube de origem
  v_texto := virar_temporada(p_liga, p_plano);
  if v_copa <> '{}'::jsonb then
    update historico h set copa = v_copa->>h.clube_id::text
      where h.liga_id = p_liga and h.temporada = v_temporada and v_copa ? h.clube_id::text;
  end if;
  if v_super is not null then
    update historico set supercopa = true where liga_id = p_liga and temporada = v_temporada and clube_id = v_super;
  end if;
  if v_lib_c is not null then
    update historico set lib = case when clube_id = v_lib_c then 'campeão' else 'vice' end
      where liga_id = p_liga and temporada = v_temporada and clube_id in (v_lib_c, v_lib_v);
  end if;
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null, copa = null where id = p_liga;
  update jogadores set amarelos_copa = null, fora_copa = null, copa_clube = null
    where (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga)
      and (amarelos_copa is not null or fora_copa is not null or copa_clube is not null);
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;
