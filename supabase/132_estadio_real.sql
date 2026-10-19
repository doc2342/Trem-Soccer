-- 132: Estádio real nas finais (18/10/2026). Final da Copa, da Libertadores e da Sul-Americana, Supercopa e Recopa vão para uma sede
-- de verdade, com a capacidade real: a Libertadores sempre no Maracanã; as outras quatro sorteadas por temporada entre as outras cinco
-- sedes, sem repetir na temporada e sem repetir a sede da temporada anterior na mesma competição. O administrador pode trocar.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 117 (definir_publico) e do 118 (lancar_rodada). Não precisa republicar a função "rodada".
--
-- Na sede: público = (torcida A + torcida B, cada uma pelo humor) × fator da competição, até a capacidade (sem sócio-torcedor);
-- Libertadores 2,5 · Copa 2,0 · Sul-Americana 1,8 · Supercopa e Recopa 1,5. Renda meio a meio, mas o fundo da liga fica com 25%
-- (e não 10%). Comida e bebida no nível 8, pelo humor médio dos dois, também meio a meio. Mesmos números em src/estadio.js (SEDES).
-- Cada final jogada numa sede fica em finais_nas_sedes (o museu da página da sede).

alter table public.partidas add column if not exists sede text;
alter table public.ligas add column if not exists sedes jsonb; -- { "temporada": n, "LIB": "maracana", "COPA": ..., "SUL": ..., "SUP": ..., "REC": ..., "anterior": {...} }

create table if not exists public.finais_nas_sedes (
  partida_id bigint primary key, -- sem chave estrangeira: o museu fica mesmo quando o calendário é apagado na virada
  liga_id bigint not null, temporada int not null, sede text not null, competicao text not null,
  casa bigint, fora bigint, casa_nome text, fora_nome text, gols_casa int, gols_fora int,
  campeao bigint, campeao_nome text, publico int, criado_em timestamptz not null default now()
);
alter table public.finais_nas_sedes enable row level security;
drop policy if exists finais_nas_sedes_ler on public.finais_nas_sedes;
create policy finais_nas_sedes_ler on public.finais_nas_sedes for select to anon, authenticated using (true);

create or replace function public.lugares_da_sede(p_sede text) returns int language sql immutable as $$
  select case p_sede when 'wembley' then 90000 when 'maracana' then 78838 when 'sansiro' then 75817
    when 'inflavel' then 75024 when 'bomboneira' then 54000 when 'laterais' then 30286 end
$$;

-- competição de uma final (null se o jogo não vai para sede)
create or replace function public.chave_da_final(p_fase text, p_grupo text, p_copa_fase int) returns text language sql immutable as $$
  select case when p_fase = 'copa' and p_copa_fase = 0 then 'SUP'
              when p_fase = 'copa' and p_copa_fase = 6 then 'COPA'
              when p_fase = 'lib' and p_copa_fase = 6 then coalesce(p_grupo, 'LIB') end
$$;

-- as sedes da temporada atual; sorteia na primeira vez que alguém pergunta
create or replace function public.sedes_da_temporada(p_liga bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_ant jsonb; v_s text[]; v_ks text[] := array['COPA', 'SUL', 'SUP', 'REC']; v_n jsonb; i int; t int;
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null then return null; end if;
  if (v_l.sedes->>'temporada')::int is not distinct from v_l.temporada then return v_l.sedes; end if;
  v_ant := coalesce(v_l.sedes, '{}'::jsonb) - 'anterior' - 'temporada';
  for t in 1..50 loop
    select array_agg(x order by random()) into v_s from unnest(array['wembley', 'sansiro', 'inflavel', 'bomboneira', 'laterais']) x;
    exit when not exists (select 1 from generate_series(1, 4) k where v_ant->>v_ks[k] = v_s[k]);
  end loop;
  v_n := jsonb_build_object('temporada', v_l.temporada, 'LIB', 'maracana', 'anterior', v_ant);
  for i in 1..4 loop v_n := v_n || jsonb_build_object(v_ks[i], v_s[i]); end loop;
  update ligas set sedes = v_n where id = p_liga;
  return v_n;
end $$;
revoke execute on function public.sedes_da_temporada(bigint) from public;
grant execute on function public.sedes_da_temporada(bigint) to anon, authenticated, service_role;

-- toda final criada (ou que vira final) recebe a sede
create or replace function public.partida_na_sede() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_k text := chave_da_final(new.fase, new.grupo, new.copa_fase);
begin
  if v_k is null then new.sede := null;
  elsif new.sede is null then new.sede := coalesce(sedes_da_temporada(new.liga_id)->>v_k, 'maracana');
  end if;
  return new;
end $$;
drop trigger if exists partida_na_sede on public.partidas;
create trigger partida_na_sede before insert or update of fase, grupo, copa_fase on public.partidas
  for each row execute function public.partida_na_sede();

-- o administrador troca a sede de uma competição (vale também para a final já marcada e ainda não jogada)
create or replace function public.trocar_sede(p_liga bigint, p_chave text, p_sede text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.eh_admin() then raise exception 'Sem permissão.'; end if;
  if lugares_da_sede(p_sede) is null or p_chave not in ('LIB', 'COPA', 'SUL', 'SUP', 'REC') then raise exception 'Sede ou competição inválida.'; end if;
  v := sedes_da_temporada(p_liga) || jsonb_build_object(p_chave, p_sede);
  update ligas set sedes = v where id = p_liga;
  update partidas set sede = p_sede where liga_id = p_liga and not coalesce(processada, false) and chave_da_final(fase, grupo, copa_fase) = p_chave;
  return v;
end $$;
revoke execute on function public.trocar_sede(bigint, text, text) from public, anon;
grant execute on function public.trocar_sede(bigint, text, text) to authenticated;

-- finais já marcadas e ainda não jogadas
update partidas set sede = coalesce(sedes_da_temporada(liga_id)->>chave_da_final(fase, grupo, copa_fase), 'maracana')
  where sede is null and not coalesce(processada, false) and chave_da_final(fase, grupo, copa_fase) is not null;

-- público: na sede, as duas torcidas vezes o fator da competição, até a capacidade; fora dela, a conta do 117
create or replace function public.definir_publico(p_partida bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype; v_l ligas%rowtype; v_c clubes%rowtype; v_f clubes%rowtype;
  v_lugares int; v_carne int; v_publico int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null then return null; end if;
  if v_p.publico is not null then return v_p.publico; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_c from clubes where id = v_p.casa;
  if v_p.sede is not null then
    select * into v_f from clubes where id = v_p.fora;
    v_publico := least(lugares_da_sede(v_p.sede), round(
      (coalesce(v_c.torcida, 0) * (0.85 + 0.3 * coalesce(v_c.humor, 8) / 16) + coalesce(v_f.torcida, 0) * (0.85 + 0.3 * coalesce(v_f.humor, 8) / 16))
      * case chave_da_final(v_p.fase, v_p.grupo, v_p.copa_fase) when 'LIB' then 2.5 when 'COPA' then 2.0 when 'SUL' then 1.8 else 1.5 end
      * (0.9 + 0.2 * random())));
  else
    v_lugares := lugares_do_estadio(v_c.estadio_nivel);
    v_carne := case when v_p.fase = 'liga' and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
    v_publico := least(v_lugares, greatest(v_carne,
      round((v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
        + 0.1 * (select torcida from clubes where id = v_p.fora)) * atracao_do_jogo(p_partida) * bonus_do_estadio(v_c.estadio_nivel))));
  end if;
  update partidas set publico = v_publico where id = p_partida;
  return v_publico;
end $$;
revoke execute on function public.definir_publico(bigint) from public, anon;
grant execute on function public.definir_publico(bigint) to authenticated, service_role;

-- lancar_rodada do 118, com a sede: fundo de 25%, comida dividida, texto com o nome da sede e o registro em finais_nas_sedes
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
  v_sede text; v_nome_sede text; v_pc numeric;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  v_copa := v_p.fase in ('copa', 'lib'); -- a Libertadores divide a renda e mexe no humor como a copa
  v_sede := v_p.sede;
  v_nome_sede := case v_sede when 'wembley' then 'Wembley' when 'maracana' then 'Maracanã' when 'sansiro' then 'San Siro'
    when 'inflavel' then 'Allianz Arena' when 'bomboneira' then 'La Bombonera' when 'laterais' then 'Municipal de Braga' end;
  v_pc := case when v_sede is not null then 0.25 else 0.10 end;
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
  v_lugares := coalesce(lugares_da_sede(v_sede), lugares_do_estadio(v_c.estadio_nivel));
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  -- se o público já foi definido no início da partida (definir_publico), vale ele
  v_publico := coalesce(v_p.publico, least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)))));
  v_avulsos := v_publico - v_carne;
  v_bilheteria := round(v_avulsos * v_d.preco_ingresso * preco_do_jogo(p_partida) / 1000.0); -- copa e playoff têm ingresso mais caro
  -- 10% da bilheteria de todo jogo vão para o fundo da liga, que paga os prêmios da copa (25% nas finais em sede)
  v_taxa := round(v_bilheteria * v_pc);
  v_bilheteria := v_bilheteria - v_taxa;
  if v_taxa > 0 then
    perform set_config('trem.fundo', 'bilheteria', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) + v_taxa where id = v_p.liga_id;
    perform set_config('trem.fundo', '', true);
  end if;
  update partidas set publico = v_publico where id = p_partida;
  -- comida e bebida: todo o público consome (sócios também), pelo nível do estádio e pelo humor de antes do jogo; fica toda com o dono do estádio
  -- (na sede: nível 8, humor médio dos dois, meio a meio)
  if v_sede is not null then
    v_gasto := comida_por_torcedor(8, (coalesce(v_c.humor, 8) + coalesce((select humor from clubes where id = v_p.fora), 8)) / 2.0);
  else
    v_gasto := comida_por_torcedor(v_c.estadio_nivel, v_c.humor);
  end if;
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
          'Bilheteria da ' || case when v_sede is not null then 'final' else 'copa' end || ', metade de ' || v_bilheteria || ' mil, já sem os '
          || case when v_sede is not null then '25' else '10' end || '% do fundo da liga (' || v_publico || ' pagantes'
          || case when v_sede is not null then ', no ' || v_nome_sede when v_clube = v_p.casa then ', no seu estádio' else ', no estádio do adversário' end || ')');
      v_total := v_total + v_parte;
    elsif v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria,
          'Bilheteria (' || v_avulsos || ' pagantes' || case when v_carne > 0 then ' e ' || v_carne || ' sócios-torcedores' else '' end || ', já sem os 10% do fundo da liga)' || case when v_liga then '' else ' · playoff' end);
      v_total := v_total + v_bilheteria;
    end if;
    if v_sede is not null and v_comida > 0 then
      v_parte := case when v_clube = v_p.casa then v_comida - v_comida / 2 else v_comida / 2 end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'comida', v_parte,
          'Comida e bebida no ' || v_nome_sede || ', metade de ' || v_comida || ' mil (' || v_publico || ' torcedores, R$ ' || replace(to_char(v_gasto, 'FM990.00'), '.', ',') || ' por cabeça)');
      v_total := v_total + v_parte;
    elsif v_clube = v_p.casa and v_comida > 0 then
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

  -- museu da sede
  if v_sede is not null and v_r.partida_id is not null then
    v_vencedor := coalesce(v_p.vencedor, nullif(v_r.relatorio->>'vencedor', '')::bigint,
      case when v_r.gols_casa > v_r.gols_fora then v_p.casa when v_r.gols_fora > v_r.gols_casa then v_p.fora end);
    insert into finais_nas_sedes (partida_id, liga_id, temporada, sede, competicao, casa, fora, casa_nome, fora_nome, gols_casa, gols_fora, campeao, campeao_nome, publico)
    values (p_partida, v_p.liga_id, v_l.temporada, v_sede, chave_da_final(v_p.fase, v_p.grupo, v_p.copa_fase), v_p.casa, v_p.fora,
      (select nome from clubes where id = v_p.casa), (select nome from clubes where id = v_p.fora), v_r.gols_casa, v_r.gols_fora,
      v_vencedor, (select nome from clubes where id = v_vencedor), v_publico)
    on conflict (partida_id) do nothing;
  end if;
  update partidas set financeiro = true where id = p_partida;
end $$;
