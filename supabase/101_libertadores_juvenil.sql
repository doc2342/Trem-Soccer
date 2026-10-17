-- Trem Soccer · Libertadores Juvenil: o mata-mata internacional dos times de base.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, REPUBLICAR a função "rodada".
-- Precisa do 70_copinha.sql, do 80_virada_com_paises.sql e do 81_libertadores.sql. Pode ser executado mais de uma vez.
--
-- 16 clubes, jogo único, nas quatro datas da Libertadores (ligas.copa->'lib'->'datas'): oitavas, quartas, semifinal e final.
-- Vagas pela temporada anterior. Brasil (8): os campeões dos grupos da liga de base e o campeão da Copinha; se algum se repetir,
-- completam as melhores campanhas do grupo A da liga de base (102). Fora (8): os 2 primeiros do campeonato principal de cada país (lá não há liga de base).
-- Oitavas sempre Brasil x estrangeiro, por sorteio; depois, sorteio livre. Sem mando; empate vai direto aos pênaltis.
-- Regras da Copinha (juvenis + profissionais formados no clube de até 21 anos, sem lesão nem cartão, bônus de treino); os clubes de fora
-- sem dirigente jogam com garotos de escolinha nível 4 (só nela). Prêmio do fundo da liga: 300 mil ao campeão e 150 mil ao vice.
-- As partidas ficam na tabela da liga de base: fase 'libjuv', grupo 'LIBJ', copinha_fase 3 a 6 (os números da Copa), rodada 200 + fase.
-- Sem as datas da Libertadores (ela não saiu na temporada), a Libertadores Juvenil também não sai.

-- Monta as oitavas. Uso interno: quem chama é gerar_liga_de_base, depois do calendário.
create or replace function public.montar_libertadores_juvenil(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_t int; v_br bigint[]; v_fora bigint[]; v_ini timestamptz; k int;
begin
  select * into v_l from ligas where id = p_liga;
  if v_l.copa is null or jsonb_typeof(v_l.copa->'lib'->'datas') is distinct from 'array' then return 0; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv') then return 0; end if;
  v_t := v_l.temporada - 1;
  -- Brasil: campeões da liga de base e da Copinha, e depois as melhores campanhas da liga de base
  select array_agg(distinct b.clube_id) into v_br from base_campeoes b join clubes c on c.id = b.clube_id
    where b.liga_id = p_liga and b.temporada = v_t and b.grupo <> 'LIBJUV' and c.pais = 'Brasil';
  v_br := coalesce(v_br, '{}');
  v_br := v_br || coalesce((select array_agg(t.clube order by t.pts desc, t.saldo desc, t.gp desc, random()) from (
      select x.clube, sum(case when x.gp > x.gc then 3 when x.gp = x.gc then 1 else 0 end) as pts, sum(x.gp - x.gc) as saldo, sum(x.gp) as gp
        from (select casa as clube, gols_casa as gp, gols_fora as gc from base_jogos where liga_id = p_liga and temporada = v_t and fase is null and gols_casa is not null
              union all select fora, gols_fora, gols_casa from base_jogos where liga_id = p_liga and temporada = v_t and fase is null and gols_casa is not null) x
        join clubes c on c.id = x.clube and c.pais = 'Brasil' and c.liga_id = p_liga
        where not x.clube = any(v_br) group by x.clube) t), '{}');
  v_br := v_br[1:8];
  -- fora: os 2 primeiros de cada país, em ordem de sorteio
  select array_agg(h.clube_id order by random()) into v_fora from historico h join clubes c on c.id = h.clube_id
    where h.liga_id = p_liga and h.temporada = v_t and h.posicao <= 2 and c.pais <> 'Brasil';
  -- ponytail: chave fixa de 8 + 8 (4 países de fora); com outro número de países, ajustar as vagas
  if coalesce(array_length(v_br, 1), 0) <> 8 or coalesce(array_length(v_fora, 1), 0) <> 8 then return 0; end if;
  v_ini := greatest((v_l.copa->'lib'->'datas'->0->>'inicio')::timestamptz, now());
  for k in 1..8 loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase)
      values (p_liga, v_l.temporada, 'LIBJ', 203, v_br[k], v_fora[k], v_ini, 'libjuv', 3);
  end loop;
  return 8;
end $$;
revoke execute on function public.montar_libertadores_juvenil(bigint) from public, anon, authenticated;

-- Com a fase toda jogada, sorteia a seguinte; depois da final, registra o campeão e paga os prêmios. A função "rodada" chama.
create or replace function public.libertadores_juvenil_avancar(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_f int; v_ids bigint[]; n int; k int; v_ini timestamptz; v_fim record;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  perform pg_advisory_xact_lock(7071, p_liga::int); -- duas chamadas juntas não sorteiam a mesma fase duas vezes
  select * into v_l from ligas where id = p_liga;
  select max(copinha_fase) into v_f from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv';
  if v_f is null then return ''; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f and (not processada or vencedor is null)) then return ''; end if;
  if v_f >= 6 then
    select vencedor, case when vencedor = casa then fora else casa end as vice into v_fim
      from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f limit 1;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_l.temporada, 'LIBJUV', v_fim.vencedor) on conflict do nothing;
    if not found then return ''; end if;
    update financas set caixa = caixa + 300 where clube_id = v_fim.vencedor;
    update financas set caixa = caixa + 150 where clube_id = v_fim.vice;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_fim.vencedor, v_l.temporada, null, 'merito', 300, 'Fundo da liga: título da Libertadores Juvenil'),
      (v_fim.vice, v_l.temporada, null, 'merito', 150, 'Fundo da liga: vice da Libertadores Juvenil');
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - 450 where id = p_liga;
    perform set_config('trem.fundo', '', true);
    return 'Libertadores Juvenil encerrada.';
  end if;
  select array_agg(vencedor order by random()) into v_ids from base_jogos
    where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f;
  n := coalesce(array_length(v_ids, 1), 0);
  if n < 2 then return ''; end if;
  v_ini := greatest(coalesce((v_l.copa->'lib'->'datas'->(v_f - 2)->>'inicio')::timestamptz, now()), now());
  for k in 1..(n / 2) loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase)
      values (p_liga, v_l.temporada, 'LIBJ', 201 + v_f, v_ids[2 * k - 1], v_ids[2 * k], v_ini, 'libjuv', v_f + 1);
  end loop;
  return 'Libertadores Juvenil: fase ' || (v_f + 1) || ' sorteada.';
end $$;
revoke execute on function public.libertadores_juvenil_avancar(bigint) from public, anon, authenticated;
grant execute on function public.libertadores_juvenil_avancar(bigint) to service_role;

-- O administrador gera a liga de base e, junto, a Copinha e a Libertadores Juvenil.
create or replace function public.gerar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador gera a liga de base.'; end if;
  n := montar_liga_de_base(p_liga);
  perform montar_copinha(p_liga);
  perform montar_libertadores_juvenil(p_liga);
  return n;
end $$;
revoke execute on function public.gerar_liga_de_base(bigint) from public, anon;
grant execute on function public.gerar_liga_de_base(bigint) to authenticated;

-- O título da liga de base conta só os jogos da liga (nem Copinha nem Libertadores Juvenil).
create or replace function public.premiar_liga_de_base(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_temp int; g record; v_c bigint; n int := 0; v_premio int := 200;
begin
  if not public.eh_admin() then raise exception 'Só o administrador premia a liga de base.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  for g in select grupo from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null group by grupo having bool_and(processada) loop
    continue when exists (select 1 from base_campeoes where liga_id = p_liga and temporada = v_temp and grupo = g.grupo);
    select t.clube into v_c from (
      select x.clube, sum(case when x.gp > x.gc then 3 when x.gp = x.gc then 1 else 0 end) as pts, sum(x.gp - x.gc) as saldo, sum(x.gp) as gp
        from (select casa as clube, gols_casa as gp, gols_fora as gc from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null and grupo = g.grupo
              union all select fora, gols_fora, gols_casa from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null and grupo = g.grupo) x
        group by x.clube order by 2 desc, 3 desc, 4 desc, 1 limit 1) t;
    continue when v_c is null;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_temp, g.grupo, v_c);
    update financas set caixa = caixa + v_premio where clube_id = v_c;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (v_c, v_temp, null, 'merito', v_premio, 'Fundo da liga: título da liga de base');
    n := n + 1;
  end loop;
  if n > 0 then
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - n * v_premio where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return case when n = 0 then '' else n * v_premio || ' mil aos ' || n || ' campeões da liga de base.' end;
end $$;
revoke execute on function public.premiar_liga_de_base(bigint) from public, anon;
grant execute on function public.premiar_liga_de_base(bigint) to authenticated;

-- temporada em andamento: se a Libertadores já tem datas, as oitavas juvenis saem agora
select public.montar_libertadores_juvenil(id) from public.ligas;
