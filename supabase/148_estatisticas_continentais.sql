-- Trem Soccer · estatísticas da Libertadores e da Sul-Americana (Competições › Campeões e recordes, recordes por competição).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não exige republicar função. Precisa do 54 e do 143 já executados.
--
-- Até aqui as estatísticas guardadas na virada eram das séries ('TODOS' e cada grupo) e da Copa do Brasil ('COPA'); as copas continentais
-- (partidas com fase 'lib', grupo 'LIB' ou 'SUL') ficavam de fora, e na virada as partidas são apagadas. Agora:
-- 1. estatisticas_da_liga aceita p_comp 'LIB' e 'SUL' (igual à do 54 no resto).
-- 2. guardar_estatisticas (a do 143) guarda também 'LIB' e 'SUL' antes da virada.
-- 3. guarda já as da temporada atual, enquanto as partidas dela ainda existem (a virada regrava por cima).
-- Vale daqui para frente: as temporadas já viradas não têm mais as partidas.

-- estatisticas_da_liga: igual à do 54_estatisticas_da_liga.sql, mais 'LIB' e 'SUL'
create or replace function public.estatisticas_da_liga(p_liga bigint, p_comp text default 'TODOS') returns jsonb
language sql stable security definer set search_path = public as $$
with jogos as (
  select p.id, p.casa, p.fora, p.publico, r.gols_casa, r.gols_fora, r.relatorio
    from partidas p join resultados r on r.partida_id = p.id
    where p.liga_id = p_liga and r.libera_em <= now()
      and case when p_comp = 'COPA' then p.fase = 'copa' when p_comp in ('LIB', 'SUL') then p.fase = 'lib' and p.grupo = p_comp when p_comp = 'TODOS' then p.fase = 'liga' else p.fase = 'liga' and p.grupo = p_comp end
), linhas as (
  select g.id as partida, g.casa, g.fora,
      case when coalesce((x.j->>'time')::int, 0) = 0 then g.casa else g.fora end as clube,
      x.j->>'id' as jid, x.j->>'nome' as nome, x.j->>'pos' as pos,
      coalesce((x.j->>'minutos')::numeric, 0) as minutos,
      coalesce((x.j->>'gols')::int, 0) as gols, coalesce((x.j->>'assistencias')::int, 0) as ass,
      coalesce((x.j->>'finalizacoes')::int, 0) as fin, coalesce((x.j->>'xg')::numeric, 0) as xg,
      (x.j->>'nota')::numeric as nota,
      coalesce((x.j->>'amarelos')::int, 0) as am, coalesce((x.j->>'vermelho')::boolean, false) as vm,
      coalesce((x.j->>'defesas')::int, 0) as def, coalesce((x.j->>'sofridos')::int, 0) as sof
    from jogos g cross join lateral jsonb_array_elements(coalesce(g.relatorio->'jogadores', '[]'::jsonb)) as x(j)
), jog as (
  select jid as id, (array_agg(nome order by partida desc))[1] as nome, (array_agg(pos order by partida desc))[1] as pos,
      (array_agg(clube order by partida desc))[1] as clube,
      count(*) filter (where minutos > 0) as j, sum(minutos)::int as min,
      sum(gols)::int as gols, sum(ass)::int as ass, sum(fin)::int as fin, round(sum(xg), 1) as xg,
      count(*) filter (where minutos >= 30) as jn, round(avg(nota) filter (where minutos >= 30), 2) as nota,
      sum(am)::int as am, count(*) filter (where vm) as vm,
      count(*) filter (where pos = 'GK' and minutos > 0) as jg, coalesce(sum(def) filter (where pos = 'GK'), 0)::int as def,
      coalesce(sum(sof) filter (where pos = 'GK'), 0)::int as sof, count(*) filter (where pos = 'GK' and minutos >= 90 and sof = 0) as sem
    from linhas group by jid
), lados as (
  select g.casa as clube, g.gols_casa as gp, g.gols_fora as gc, g.relatorio->'estat'->0 as e, g.publico from jogos g
  union all
  select g.fora, g.gols_fora, g.gols_casa, g.relatorio->'estat'->1, null from jogos g
), clu as (
  select clube, count(*) as j, sum(gp)::int as gp, sum(gc)::int as gc,
      coalesce(sum((e->>'finalizacoes')::int), 0)::int as fin, coalesce(sum((e->>'noGol')::int), 0)::int as nogol,
      round(avg((e->>'posse')::numeric)) as posse, coalesce(sum((e->>'faltas')::int), 0)::int as faltas,
      coalesce(sum((e->>'amarelos')::int), 0)::int as am, coalesce(sum((e->>'vermelhos')::int), 0)::int as vm,
      coalesce(sum((e->>'escanteios')::int), 0)::int as esc, round(coalesce(sum((e->>'xg')::numeric), 0), 1) as xg,
      round(avg(publico)) as publico
    from lados group by clube
)
select jsonb_build_object(
  'jogos', (select count(*) from jogos),
  'minimo', (select greatest(3, ceil(coalesce(max(jn), 0) * 0.5)) from jog),
  'artilheiros', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id, nome, pos, clube, j, min, gols, fin, xg from jog where gols > 0 order by gols desc, min asc, nome limit 20) t),
  'assistencias', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id, nome, pos, clube, j, min, ass, gols from jog where ass > 0 order by ass desc, min asc, nome limit 20) t),
  'notas', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id, nome, pos, clube, jn as j, nota, gols, ass from jog
              where nota is not null and jn >= (select greatest(3, ceil(coalesce(max(jn), 0) * 0.5)) from jog) order by nota desc, jn desc, nome limit 20) t),
  'goleiros', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id, nome, pos, clube, jg as j, sem, def, sof from jog where jg > 0 order by sem desc, sof::numeric / jg asc, def desc limit 20) t),
  'cartoes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id, nome, pos, clube, j, am, vm from jog where am + vm > 0 order by vm desc, am desc, j asc limit 20) t),
  'clubes', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select * from clu order by gp desc, gc asc) t),
  'recordes', jsonb_build_object(
    'goleada', (select to_jsonb(t) from (select id, casa, fora, gols_casa, gols_fora from jogos order by abs(gols_casa - gols_fora) desc, gols_casa + gols_fora desc, id limit 1) t),
    'gols', (select to_jsonb(t) from (select id, casa, fora, gols_casa, gols_fora from jogos order by gols_casa + gols_fora desc, id limit 1) t),
    'publico', (select to_jsonb(t) from (select id, casa, fora, publico from jogos where publico is not null order by publico desc, id limit 1) t),
    'nota', (select to_jsonb(t) from (select partida as id, casa, fora, nome, clube, nota, gols, ass from linhas where nota is not null and minutos >= 30 order by nota desc, gols desc, partida limit 1) t)
  )
)
$$;
revoke execute on function public.estatisticas_da_liga(bigint, text) from public;
grant execute on function public.estatisticas_da_liga(bigint, text) to anon, authenticated, service_role;

-- guardar_estatisticas: igual à do 143_recordes_dos_clubes.sql, com 'LIB' e 'SUL' no laço
create or replace function public.guardar_estatisticas(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; v_comp text; n int := 0; v_d jsonb;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  if v_t is null then return 0; end if;
  for v_comp in select 'TODOS' union all select 'COPA' union all select 'LIB' union all select 'SUL' union all (select distinct grupo from partidas where liga_id = p_liga and fase = 'liga' order by 1) loop
    v_d := estatisticas_da_liga(p_liga, v_comp);
    if coalesce((v_d->>'jogos')::int, 0) = 0 then continue; end if;
    insert into estatisticas_historico (liga_id, temporada, comp, dados) values (p_liga, v_t, v_comp, v_d)
      on conflict (liga_id, temporada, comp) do update set dados = excluded.dados;
    n := n + 1;
  end loop;
  v_d := recordes_dos_clubes(p_liga);
  if v_d <> '{}'::jsonb then
    insert into estatisticas_historico (liga_id, temporada, comp, dados) values (p_liga, v_t, 'CLUBES', v_d)
      on conflict (liga_id, temporada, comp) do update set dados = excluded.dados;
  end if;
  insert into jogadores_historico (liga_id, temporada, jogador_id, clube_id, idade, pos, at, jogos, minutos, gols, ass, nota)
    select p_liga, v_t, j.id, j.clube_id, j.idade, j.pos, j.at, coalesce(s.jogos, 0), coalesce(s.minutos, 0), coalesce(s.gols, 0), coalesce(s.ass, 0), s.nota
      from jogadores j join clubes c on c.id = j.clube_id and c.liga_id = p_liga
        left join numeros_dos_jogadores(p_liga) s on s.jid = 'j' || j.id
    on conflict (liga_id, temporada, jogador_id) do update set clube_id = excluded.clube_id, idade = excluded.idade, pos = excluded.pos, at = excluded.at,
      jogos = excluded.jogos, minutos = excluded.minutos, gols = excluded.gols, ass = excluded.ass, nota = excluded.nota;
  return n;
end $$;
revoke execute on function public.guardar_estatisticas(bigint) from public, anon;
grant execute on function public.guardar_estatisticas(bigint) to authenticated, service_role;

-- a temporada atual, já (só quando houve jogo liberado)
insert into estatisticas_historico (liga_id, temporada, comp, dados)
  select l.id, l.temporada, c.comp, d.dados from ligas l cross join (values ('LIB'), ('SUL')) as c(comp)
    cross join lateral (select estatisticas_da_liga(l.id, c.comp) as dados) d
  where coalesce((d.dados->>'jogos')::int, 0) > 0
  on conflict (liga_id, temporada, comp) do update set dados = excluded.dados;
