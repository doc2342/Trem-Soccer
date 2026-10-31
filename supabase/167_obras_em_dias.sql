-- Trem Soccer · 167: o prazo das obras corre em dias, não em rodadas de liga (30/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 132 (lancar_rodada), do 146 (tarefas_do_minuto) e do 154 (iniciar_obra). Depois: publicar o site. Não precisa republicar função.
--
-- Antes a obra só andava no apito final de jogo de liga do próprio clube: quarta de copa não contava, quarta de liga contava.
-- Agora cada obra tem data de entrega (termina_em) e fica pronta nela, joguem os clubes ou não; o agendamento de cada minuto entrega.
-- Prazos na mesma fração da temporada: o calendário atual tem 28 datas (22 de liga e 6 de copa, uma por dia) para as 22 rodadas,
-- então 1, 3, 6, 11, 18, 22, 27 e 36 rodadas viram 1, 4, 8, 14, 23, 28, 34 e 46 dias (dias inteiros). A reforma segue em metade.
-- rodadas_total e rodadas_restantes passam a contar dias. Em calendário de teste (rodadas a minutos), o "dia" é o do 73 (ajustar_prazos).
-- As obras em andamento viram dias pela mesma conta (o que falta × 28/22). A manutenção continua cobrada nos jogos de liga.

alter table public.obras add column if not exists termina_em timestamptz;

create or replace function public.prazo_da_obra(p_nivel int) returns int language sql immutable as $$
  select (array[1, 4, 8, 14, 23, 28, 34, 46])[p_nivel]
$$;

-- o "dia" do calendário, em horas: da rodada 1 à rodada 2 da liga, no máximo 24 (a mesma conta do ajustar_prazos do 73); sem calendário, 24
create or replace function public.horas_do_dia(p_liga bigint) returns numeric language sql stable set search_path = public as $$
  select coalesce(nullif(least(24, extract(epoch from (select min(inicio) from partidas where liga_id = p_liga and fase = 'liga' and rodada = 2)
                                                   - (select min(inicio) from partidas where liga_id = p_liga and fase = 'liga' and rodada = 1)) / 3600.0), 0), 24)
$$;

-- toda obra nova ganha a data de entrega pelo prazo em dias (as funções que criam obras não mudam)
create or replace function public.obra_com_data() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.termina_em is null then
    new.termina_em := now() + make_interval(secs => new.rodadas_total * 3600 * horas_do_dia((select liga_id from clubes where id = new.clube_id)));
  end if;
  return new;
end $$;
drop trigger if exists obra_com_data on public.obras;
create trigger obra_com_data before insert on public.obras for each row execute function public.obra_com_data();

-- obras em andamento de antes do 167: o que falta em rodadas vira dias
update public.obras o set
  rodadas_total = greatest(1, round(o.rodadas_total * 28 / 22.0)),
  rodadas_restantes = greatest(1, round(o.rodadas_restantes * 28 / 22.0)),
  termina_em = now() + make_interval(secs => greatest(1, round(o.rodadas_restantes * 28 / 22.0)) * 3600 * public.horas_do_dia(c.liga_id))
from public.clubes c where c.id = o.clube_id and not o.concluida and o.termina_em is null;

-- entrega as obras vencidas e atualiza os dias que faltam nas outras (chamada pelo agendamento de cada minuto)
create or replace function public.concluir_obras() returns int
language plpgsql security definer set search_path = public as $$
declare v_o obras%rowtype; n int := 0;
begin
  for v_o in select * from obras where not concluida and termina_em <= now() for update loop
    update obras set rodadas_restantes = 0, concluida = true where id = v_o.id;
    update clubes set
      ct_nivel = case when v_o.estrutura = 'ct' then v_o.nivel_alvo else ct_nivel end,
      medico_nivel = case when v_o.estrutura = 'medico' then v_o.nivel_alvo else medico_nivel end,
      fisio_nivel = case when v_o.estrutura = 'fisio' then v_o.nivel_alvo else fisio_nivel end,
      base_nivel = case when v_o.estrutura = 'base' then v_o.nivel_alvo else base_nivel end,
      estadio_nivel = case when v_o.estrutura = 'estadio' then v_o.nivel_alvo else estadio_nivel end
    where id = v_o.clube_id;
    n := n + 1;
  end loop;
  update obras o set rodadas_restantes = r.dias
    from (select o2.id, greatest(1, ceil(extract(epoch from o2.termina_em - now()) / (3600 * horas_do_dia(c.liga_id))))::int dias
          from obras o2 join clubes c on c.id = o2.clube_id where not o2.concluida and o2.termina_em > now()) r
    where o.id = r.id and o.rodadas_restantes <> r.dias;
  return n;
end $$;
revoke execute on function public.concluir_obras() from public, anon, authenticated;

-- tarefas_do_minuto do 146, entregando as obras antes de tudo
create or replace function public.tarefas_do_minuto() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  l record; v_precisa boolean;
begin
  -- as funções chamadas abaixo só aceitam o servidor (service_role) ou um administrador: o agendamento age como o servidor
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  begin perform concluir_obras(); exception when others then null; end;
  for l in select id from ligas loop
    begin perform resolver_leiloes(l.id); exception when others then null; end;
    begin perform anunciar_aposentadorias(l.id); exception when others then null; end;
    begin perform copa_avancar(l.id); exception when others then null; end;
    begin perform bots_investem(l.id); exception when others then null; end;
  end loop;
  -- uma vez por hora, o histórico do agendamento fica só com os últimos 2 dias
  if extract(minute from now()) = 0 then
    begin delete from cron.job_run_details where end_time < now() - interval '2 days'; exception when others then null; end;
  end if;
  -- a função "rodada" tem trabalho?
  begin
    select
      -- partida cuja hora chegou, numa liga que não está pausada
      exists (select 1 from partidas p join ligas g on g.id = p.liga_id where not p.processada and p.inicio <= now() and not coalesce(g.pausada, false))
      -- efeitos de um apito final para gravar (lesões, suspensões, forma, caixa, treino)
      or exists (select 1 from resultados where efeitos is not null and libera_em <= now())
      -- jogo da liga de base na hora
      or exists (select 1 from base_jogos where not processada and inicio <= now())
      -- janela aberta sem a rodada de negócios entre bots
      or exists (select 1 from ligas g where not coalesce(g.pausada, false) and janela_do_mercado(g.id) is not null
                   and g.bots_mercado is distinct from g.temporada || ':' || janela_do_mercado(g.id))
      -- jogador listado por dirigente esperando os bots olharem
      or exists (select 1 from ligas g where exists (select 1 from listados_para_os_bots(g.id)))
      -- fase de liga (ou semifinais) encerrada e a fase seguinte dos playoffs ainda não criada
      or exists (select 1 from ligas g where not coalesce(g.pausada, false)
                   and exists (select 1 from partidas where liga_id = g.id and fase = 'liga')
                   and not exists (select 1 from partidas where liga_id = g.id and fase in ('liga', 'semi') and not processada)
                   and not exists (select 1 from partidas where liga_id = g.id and fase = 'final'))
      -- temporada acabada há mais de uma hora e ainda não fechada (145_fechamento_da_temporada.sql)
      or exists (select 1 from ligas g where not coalesce(g.pausada, false) and g.temporada_fechada is distinct from g.temporada
                   and (coalesce((g.copa->>'sem_playoffs')::boolean, false) or exists (select 1 from partidas where liga_id = g.id and fase = 'final'))
                   and not exists (select 1 from partidas where liga_id = g.id and not processada)
                   and (select max(fim) from partidas where liga_id = g.id) <= now() - interval '1 hour')
      into v_precisa;
  exception when others then v_precisa := true; -- na dúvida, chama a função
  end;
  return coalesce(v_precisa, true);
end $$;

-- lancar_rodada do 132, sem o passo da obra (agora é o concluir_obras)
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_r resultados%rowtype;
  v_c clubes%rowtype;
  v_d divisoes%rowtype;
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
