-- 114 · Pirâmide da T14: Série A de 12 (22 rodadas), Série B em 3 grupos de 8 (B1 "B", B2 "C", B3 "F"; 14 rodadas + playoff),
-- sem Série C ("D" e "E" ficam só no histórico) e clubes GUARDADOS no grupo "X" (sem partidas: fora de liga, copa, base e folha).
-- Rodar ANTES de gerar o calendário da T14 (pode ser já: nada muda na T13, que tem 18 rodadas em todo grupo). Sem republicar função.

-- 1. B3 é segunda divisão; guardado é terceira (só para os valores de torcida e teto, que ele não usa)
create or replace function public.divisao_do_grupo(p_grupo text) returns smallint language sql immutable as $$
  select (case when p_grupo = 'A' or public.pais_do_grupo(p_grupo) <> 'Brasil' then 1 when p_grupo in ('B', 'C', 'F') then 2 else 3 end)::smallint
$$;

-- 2. Rodadas de liga do grupo (A 22, B 14, países 18): salário, TV, patrocínio, manutenção, paraquedas e comissão são cobrados
--    por jogo como valor da temporada / rodadas DO GRUPO, para a temporada inteira continuar valendo o mesmo em toda série.
--    Sem partidas de liga no grupo (copa, Libertadores), vale ligas.rodadas_por_temporada.
create or replace function public.rodadas_do_grupo(p_liga bigint, p_grupo text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select max(rodada) from partidas where liga_id = p_liga and grupo = p_grupo and fase = 'liga'),
                  (select rodadas_por_temporada from ligas where id = p_liga), 18)
$$;
grant execute on function public.rodadas_do_grupo(bigint, text) to anon, authenticated;

do $$
declare r record; d text; n text; v_trocadas text := '';
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('lancar_rodada', 'lancar_treinadores', 'atracao_do_jogo', 'definir_carne') loop
    d := pg_get_functiondef(r.oid);
    if r.proname = 'definir_carne' then -- a temporada do Sócio-Torcedor: os jogos em casa do grupo do clube
      n := replace(d, 'v_l.rodadas_por_temporada / 2', 'public.rodadas_do_grupo(v_c.liga_id, v_c.grupo) / 2');
    else
      n := replace(replace(d, 'coalesce(v_l.rodadas_por_temporada, 18)', 'public.rodadas_do_grupo(v_p.liga_id, v_p.grupo)'),
                   'v_l.rodadas_por_temporada', 'public.rodadas_do_grupo(v_p.liga_id, v_p.grupo)');
    end if;
    if n = d then raise exception '%: rodadas_por_temporada não encontrado; nada foi trocado.', r.proname; end if;
    execute n;
    v_trocadas := v_trocadas || ' ' || r.proname;
  end loop;
  raise notice 'Funções com as rodadas do grupo:%', v_trocadas;
end $$;

-- 3. Ingresso dos playoffs: preliminar e semifinal 25% mais caras, a final 50% (antes era pela rodada: 19 semi, 20 final)
create or replace function public.preco_do_jogo(p_partida bigint) returns numeric language sql stable set search_path = public as $$
  select case when p.fase in ('copa', 'lib') then (array[1, 1, 1.15, 1.3, 1.5, 2])[least(6, greatest(1, coalesce(p.copa_fase, 1)))]
              when p.fase = 'liga' then 1 when p.fase = 'final' then 1.5 else 1.25 end
    from partidas p where p.id = p_partida
$$;

-- 4. Playoff da B: a preliminar ('pre') entra no índice que barra a criação em dobro; a semifinal e a final têm ida e volta
--    (mandantes trocados, então não se chocam no índice)
drop index if exists public.partidas_playoff_unico;
create unique index partidas_playoff_unico on public.partidas (liga_id, grupo, fase, casa, fora) where fase in ('pre', 'semi', 'final', 'acesso');

-- 5. Liga de base: o primeiro turno espelhado de CADA grupo (A 11 rodadas, B 7), uma rodada a cada duas do grupo
create or replace function public.montar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; n int;
begin
  select temporada into v_temp from ligas where id = p_liga;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_temp and processada) then return 0; end if;
  delete from base_jogos where liga_id = p_liga and temporada = v_temp;
  insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio)
    select p.liga_id, v_temp, p.grupo, p.rodada, p.casa, p.fora,
        coalesce((select min(q.inicio) from partidas q where q.liga_id = p.liga_id and q.grupo = p.grupo and q.fase = 'liga' and q.rodada = p.rodada * 2), p.inicio)
      from partidas p
      join (select grupo, max(rodada) / 2 as turno from partidas where liga_id = p_liga and fase = 'liga' group by grupo) t on t.grupo = p.grupo
      where p.liga_id = p_liga and p.fase = 'liga' and p.rodada <= t.turno and public.pais_do_grupo(p.grupo) = 'Brasil';
  get diagnostics n = row_count;
  return n;
end $$;

-- 6. Guardados fora da Copinha e dos investimentos dos bots
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.montar_copinha(bigint)'::regprocedure);
  n := replace(d, 'from clubes where liga_id = p_liga and pais = ''Brasil'';', 'from clubes where liga_id = p_liga and pais = ''Brasil'' and grupo <> ''X'';');
  if n = d then raise exception 'montar_copinha: trecho não encontrado; nada foi trocado.'; end if;
  execute n;
  d := pg_get_functiondef('public.bots_investem(bigint)'::regprocedure);
  n := replace(d, 'from clubes cl where cl.liga_id = p_liga and cl.dono is null', 'from clubes cl where cl.liga_id = p_liga and cl.dono is null and cl.grupo <> ''X''');
  if n = d then raise exception 'bots_investem: trecho não encontrado; nada foi trocado.'; end if;
  execute n;
end $$;

-- 7. Jogador de clube guardado não sai nem entra (multa, empréstimo, mercado dos bots): o clube fica congelado até voltar.
--    Vale para todos os caminhos que mudam o clube do jogador. Aposentadoria (apagar) e virada (envelhecer) seguem normais.
create or replace function public.guardado_congelado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clube_id is distinct from old.clube_id
     and exists (select 1 from clubes where id in (old.clube_id, new.clube_id) and grupo = 'X') then
    raise exception 'Clube guardado: fora do mercado até voltar a uma competição.';
  end if;
  return new;
end $$;
drop trigger if exists jogadores_guardado_congelado on public.jogadores;
create trigger jogadores_guardado_congelado before update of clube_id on public.jogadores for each row execute function public.guardado_congelado();

-- 8. Prestígio: desde a T14 o campeão da Série B é o vencedor do playoff (o que sobe); até a T13, o 1º do grupo
create or replace function public.atualizar_torcidas(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  update clubes c set torcida_fator_temporada = v_t,
      torcida_fator = least(2.15, greatest(1, c.torcida_fator
        + case h.divisao when 1 then 0.03 + case when h.posicao = 1 then 0.10 else 0 end
                         when 2 then case when (h.temporada >= 14 and h.destino = 'subiu') or (h.temporada < 14 and h.posicao = 1) then 0.03 else -0.02 end
                         else case when h.posicao = 1 then 0 else -0.04 end end
        + case h.copa when 'campeão' then 0.08 when 'vice' then 0.03 else 0 end))
    from historico h
    where h.liga_id = p_liga and h.temporada = v_t - 1 and h.clube_id = c.id and c.torcida_fator_temporada is distinct from v_t;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.atualizar_torcidas(bigint) from public, anon;
grant execute on function public.atualizar_torcidas(bigint) to authenticated, service_role;

-- conferência: as 4 funções trocadas e o gatilho
select p.proname, p.prosrc like '%rodadas_do_grupo%' as com_rodadas_do_grupo from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname in ('lancar_rodada', 'lancar_treinadores', 'atracao_do_jogo', 'definir_carne') order by 1;
