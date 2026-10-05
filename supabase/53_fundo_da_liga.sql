-- Trem Soccer · fundo da liga à vista de todos (tela "Federação", em Classificação).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 52_pacote_da_economia.sql já executado. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- O saldo do fundo (ligas.fundo_taca) já era público. Aqui entra o resumo de onde o dinheiro veio e para onde foi, por temporada:
--   bilheteria (10% de todo jogo), imposto (metade do imposto sobre o lucro, na virada), taxas (metade das taxas de transferência),
--   copa (prêmios pagos) e devolucao (taxa devolvida quando o administrador anula uma transferência).
-- A conta começa a partir de agora: o que entrou e saiu antes deste arquivo não aparece no resumo, só no saldo.

create table if not exists public.fundo_resumo (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  tipo text not null,
  valor int not null default 0,
  primary key (liga_id, temporada, tipo)
);
alter table public.fundo_resumo enable row level security;
drop policy if exists fundo_resumo_leitura on public.fundo_resumo;
create policy fundo_resumo_leitura on public.fundo_resumo for select using (true);

-- Toda mudança no saldo do fundo cai no resumo. O motivo vem de quem mexeu ('trem.fundo'); na virada é o imposto; fora isso, entrada é
-- taxa de transferência e saída é devolução. Reiniciar o teste (a temporada volta) apaga o resumo.
create or replace function public.anotar_fundo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_delta int; v_tipo text;
begin
  if new.temporada < old.temporada then delete from fundo_resumo where liga_id = new.id; return null; end if;
  v_delta := coalesce(new.fundo_taca, 0) - coalesce(old.fundo_taca, 0);
  if v_delta = 0 then return null; end if;
  v_tipo := nullif(current_setting('trem.fundo', true), '');
  if v_tipo is null then
    v_tipo := case when new.temporada > old.temporada or coalesce(current_setting('trem.virada', true), '') = '1' then 'imposto'
                   when v_delta > 0 then 'taxas' else 'devolucao' end;
  end if;
  insert into fundo_resumo (liga_id, temporada, tipo, valor) values (new.id, old.temporada, v_tipo, v_delta)
    on conflict (liga_id, temporada, tipo) do update set valor = fundo_resumo.valor + excluded.valor;
  return null;
end $$;
drop trigger if exists ligas_anotar_fundo on public.ligas;
create trigger ligas_anotar_fundo after update of fundo_taca, temporada on public.ligas for each row execute function public.anotar_fundo();

-- as duas funções que mexem no fundo a cada rodada passam a dizer o motivo
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
  v_lugares := 5000 + 5000 * v_c.estadio_nivel;
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  -- se o público já foi definido no início da partida (definir_publico), vale ele
  v_publico := coalesce(v_p.publico, least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)))));
  v_avulsos := v_publico - v_carne;
  v_bilheteria := round(v_avulsos * v_d.preco_ingresso / 1000.0);
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
        torcida = least(round(v_d.torcida_base * 1.4), greatest(round(v_d.torcida_base * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;

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
    -- o fundo precisa ter saldo para a fase inteira; sem saldo, o prêmio fica pendente e sai quando o fundo encher
    if coalesce(v_l.fundo_taca, 0) - v_total < v_valor * (select count(*) from (select casa as clube from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
        union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) x) then continue; end if;
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
    perform set_config('trem.fundo', 'copa', true);
    update ligas set fundo_taca = fundo_taca - v_total, copa = jsonb_set(v_l.copa, '{pagas}', v_pagas) where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return v_total;
end $$;
revoke execute on function public.copa_premiar(bigint) from public, anon, authenticated;
grant execute on function public.copa_premiar(bigint) to service_role;
