-- Trem Soccer · Copa do Brasil, parte 3 (C3): prêmios e bilheteria dividida.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 48_copa_partida.sql já executado. Não precisa republicar nenhuma função. Pode ser executado mais de uma vez.
--
-- Prêmios, pagos pelo fundo da liga (ligas.fundo_taca), a cada clube que entra na fase: 32 clubes 50 mil, oitavas 150 mil,
-- quartas 300 mil, semifinal 500 mil; no fim da final, vice 800 mil e campeão 2,0 mi. A preliminar não paga.
-- Cada pagamento é feito uma vez só: as fases pagas ficam anotadas em ligas.copa->'pagas' (a virada apaga ligas.copa).
-- A renda do jogo de copa passa a ser dividida meio a meio entre os dois clubes, e o humor da torcida não tem mais peso de mando.

-- Paga os prêmios das fases já sorteadas e da final já encerrada que ainda não foram pagos. Devolve quanto pagou.
create or replace function public.copa_premiar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_pagas jsonb; v_fase int; v_valor int; v_total int := 0; v_n int;
  v_final partidas%rowtype; v_campeao bigint; v_vice bigint;
  c_valores int[] := array[0, 50, 150, 300, 500]; -- ao entrar na fase 1 a 5 (preliminar, 32, oitavas, quartas, semifinal)
  c_nomes text[] := array['preliminar', 'fase de 32', 'oitavas', 'quartas', 'semifinal'];
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.copa is null then return 0; end if;
  v_pagas := coalesce(v_l.copa->'pagas', '[]'::jsonb);
  for v_fase in 2..5 loop
    if v_pagas @> to_jsonb(v_fase) then continue; end if;
    if not exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) then continue; end if;
    v_valor := c_valores[v_fase];
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select x.clube, v_l.temporada, 100 + v_fase, 'copa', v_valor, 'Copa do Brasil: prêmio por chegar ' || case when v_fase = 2 then 'à ' else 'às ' end || c_nomes[v_fase]
        from (select casa as clube from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
              union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) x;
    get diagnostics v_n = row_count;
    update financas f set caixa = f.caixa + v_valor
      where f.clube_id in (select casa from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
                           union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase);
    v_total := v_total + v_valor * v_n;
    v_pagas := v_pagas || to_jsonb(v_fase);
  end loop;
  -- final: paga depois do apito final (resultado liberado e efeitos gravados, com o vencedor anotado)
  if not v_pagas @> to_jsonb(6) then
    select * into v_final from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = 6 order by id limit 1;
    if v_final.id is not null and v_final.processada and v_final.fim <= now()
       and exists (select 1 from resultados r where r.partida_id = v_final.id and r.efeitos is null) then
      select coalesce(v_final.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint,
                      case when r.gols_fora > r.gols_casa then v_final.fora else v_final.casa end)
        into v_campeao from resultados r where r.partida_id = v_final.id;
      v_vice := case when v_campeao = v_final.casa then v_final.fora else v_final.casa end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_campeao, v_l.temporada, 106, 'copa', 2000, 'Copa do Brasil: prêmio de campeão'),
        (v_vice, v_l.temporada, 106, 'copa', 800, 'Copa do Brasil: prêmio de vice-campeão');
      update financas set caixa = caixa + 2000 where clube_id = v_campeao;
      update financas set caixa = caixa + 800 where clube_id = v_vice;
      v_total := v_total + 2800;
      v_pagas := v_pagas || to_jsonb(6);
      v_l.copa := jsonb_set(v_l.copa, '{campeao}', to_jsonb(v_campeao));
    end if;
  end if;
  if v_total > 0 then
    update ligas set fundo_taca = fundo_taca - v_total, copa = jsonb_set(v_l.copa, '{pagas}', v_pagas) where id = p_liga;
  end if;
  return v_total;
end $$;
revoke execute on function public.copa_premiar(bigint) from public, anon, authenticated;
grant execute on function public.copa_premiar(bigint) to service_role;

-- O sorteio da fase seguinte, igual ao do 48_copa_partida.sql, agora com o nome de copa_sortear.
create or replace function public.copa_sortear(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_copa jsonb; v_fase int; v_ids bigint[]; v_data jsonb; n int := 0; i int; a bigint; b bigint; na int; nb int;
begin
  select copa into v_copa from ligas where id = p_liga for update;
  if v_copa is null then return 0; end if;
  select max(copa_fase) into v_fase from partidas where liga_id = p_liga and fase = 'copa';
  if v_fase is null or v_fase >= 6 then return 0; end if;
  if exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase and (not processada or fim > now())) then return 0; end if;
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id
             where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase and (r.partida_id is null or r.efeitos is not null)) then return 0; end if;
  v_data := v_copa->'datas'->v_fase; -- índice começa em zero: a posição v_fase é a da fase seguinte
  if v_data is null then return 0; end if;
  select array_agg(x.id order by random()) into v_ids from (
    select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase
    union all
    select (e.value)::bigint from jsonb_array_elements_text(v_copa->'diretos') e where v_fase = 1
  ) x;
  if v_ids is null or array_length(v_ids, 1) < 2 then return 0; end if;
  i := 1;
  while i + 1 <= array_length(v_ids, 1) loop
    a := v_ids[i]; b := v_ids[i + 1];
    select estadio_nivel into na from clubes where id = a;
    select estadio_nivel into nb from clubes where id = b;
    if coalesce(nb, 1) > coalesce(na, 1) then a := v_ids[i + 1]; b := v_ids[i]; end if; -- joga no estádio maior; iguais, vale a ordem do sorteio
    insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim)
      values (p_liga, 'COPA', 100 + v_fase + 1, 'copa', v_fase + 1, a, b, (v_data->>'inicio')::timestamptz, (v_data->>'fim')::timestamptz);
    n := n + 1; i := i + 2;
  end loop;
  return n;
end $$;
revoke execute on function public.copa_sortear(bigint) from public, anon, authenticated;
grant execute on function public.copa_sortear(bigint) to service_role;

-- O que a função "rodada" chama a cada minuto: sorteia a fase seguinte quando a atual acabou e paga os prêmios devidos.
-- Pode ser chamada por qualquer um, quantas vezes for.
create or replace function public.copa_avancar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  n := copa_sortear(p_liga);
  perform copa_premiar(p_liga);
  return n;
end $$;
revoke execute on function public.copa_avancar(bigint) from public, anon;
grant execute on function public.copa_avancar(bigint) to authenticated, service_role;

-- O lançamento da partida, igual ao do 34_caixa_no_apito_final.sql, com a bilheteria da copa dividida e o humor sem mando na copa.
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
  v_copa boolean; v_vencedor bigint; v_parte int;
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
  v_lugares := 5000 + 5000 * v_c.estadio_nivel;
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  -- se o público já foi definido no início da partida (definir_publico), vale ele
  v_publico := coalesce(v_p.publico, least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)))));
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
    if v_copa then
      -- copa: a renda do jogo é dividida meio a meio (o centavo que sobra fica com o dono do estádio)
      v_parte := case when v_clube = v_p.casa then v_bilheteria - v_bilheteria / 2 else v_bilheteria / 2 end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_parte,
          'Bilheteria da copa, metade de ' || v_bilheteria || ' mil (' || v_publico || ' pagantes' || case when v_clube = v_p.casa then ', no seu estádio' else ', no estádio do adversário' end || ')');
      v_total := v_total + v_parte;
    elsif v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria,
          'Bilheteria (' || v_avulsos || ' pagantes' || case when v_carne > 0 then ' e ' || v_carne || ' sócios-torcedores' else '' end || ')' || case when v_liga then '' else ' · playoff' end);
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
        torcida = least(round(v_d.torcida_base * 1.4), greatest(round(v_d.torcida_base * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;
