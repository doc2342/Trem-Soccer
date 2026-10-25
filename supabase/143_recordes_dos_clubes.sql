-- Trem Soccer · recordes de cada clube (Clube › Troféus).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não exige republicar função. Precisa do 54, do 84 e do 89 já executados.
--
-- Até aqui, maior goleada, jogo com mais gols, maior público e melhor atuação só existiam para a liga inteira: na virada as partidas
-- são apagadas e só ficavam guardados os recordes da liga. Agora:
-- 1. recordes_dos_clubes: os quatro recordes de cada clube na temporada atual (liga, playoff e copas; só resultados liberados).
--    Maior goleada do clube = a vitória com mais gols de diferença; maior público = jogo em que o clube era o dono da casa.
-- 2. guardar_estatisticas (a do 84, mais uma linha): antes da virada grava também os recordes de todos os clubes em
--    estatisticas_historico, com comp 'CLUBES' (dados = { "<clube_id>": { goleada, gols, publico, nota } }).
-- 3. recordes_da_liga com p_clube: os quatro recordes passam a vir das temporadas guardadas do clube mais a atual.
-- Vale daqui para frente: as temporadas já viradas não têm mais as partidas para refazer a conta.

create or replace function public.recordes_dos_clubes(p_liga bigint, p_clube bigint default null) returns jsonb
language sql stable security definer set search_path = public as $$
with jogos as (
  select p.id, p.casa, p.fora, p.publico, r.gols_casa, r.gols_fora, r.relatorio, case when p.fase in ('copa', 'lib') then 'COPA' else 'TODOS' end as comp
    from partidas p join resultados r on r.partida_id = p.id
    where p.liga_id = p_liga and r.libera_em <= now() and (p_clube is null or p_clube in (p.casa, p.fora))
), lados as (
  select g.id, g.casa, g.fora, g.publico, g.gols_casa, g.gols_fora, g.comp, g.casa as clube, g.gols_casa - g.gols_fora as saldo from jogos g
  union all
  select g.id, g.casa, g.fora, g.publico, g.gols_casa, g.gols_fora, g.comp, g.fora, g.gols_fora - g.gols_casa from jogos g
), linhas as (
  select g.id, g.casa, g.fora, g.comp, case when coalesce((x.j->>'time')::int, 0) = 0 then g.casa else g.fora end as clube,
      x.j->>'nome' as nome, (x.j->>'nota')::numeric as nota, coalesce((x.j->>'gols')::int, 0) as gols,
      coalesce((x.j->>'assistencias')::int, 0) as ass, coalesce((x.j->>'minutos')::numeric, 0) as minutos
    from jogos g cross join lateral jsonb_array_elements(coalesce(g.relatorio->'jogadores', '[]'::jsonb)) as x(j)
), quais as (
  select distinct clube from lados where p_clube is null or clube = p_clube
)
select coalesce(jsonb_object_agg(q.clube::text, jsonb_strip_nulls(jsonb_build_object(
  'goleada', (select to_jsonb(t) from (select id, casa, fora, gols_casa, gols_fora, comp from lados l where l.clube = q.clube and l.saldo > 0
      order by l.saldo desc, l.gols_casa + l.gols_fora desc, l.id limit 1) t),
  'gols', (select to_jsonb(t) from (select id, casa, fora, gols_casa, gols_fora, comp from lados l where l.clube = q.clube
      order by l.gols_casa + l.gols_fora desc, l.id limit 1) t),
  'publico', (select to_jsonb(t) from (select id, casa, fora, publico, comp from lados l where l.clube = q.clube and l.casa = q.clube and l.publico is not null
      order by l.publico desc, l.id limit 1) t),
  'nota', (select to_jsonb(t) from (select id, casa, fora, nome, clube, nota, gols, ass, comp from linhas n where n.clube = q.clube and n.nota is not null and n.minutos >= 30
      order by n.nota desc, n.gols desc, n.id limit 1) t)
))), '{}'::jsonb) from quais q
$$;
revoke execute on function public.recordes_dos_clubes(bigint, bigint) from public;
grant execute on function public.recordes_dos_clubes(bigint, bigint) to anon, authenticated, service_role;

-- guardar_estatisticas: igual à do 84_historico_dos_jogadores.sql, e grava também os recordes dos clubes (comp 'CLUBES')
create or replace function public.guardar_estatisticas(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; v_comp text; n int := 0; v_d jsonb;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  if v_t is null then return 0; end if;
  for v_comp in select 'TODOS' union all select 'COPA' union all (select distinct grupo from partidas where liga_id = p_liga and fase = 'liga' order by 1) loop
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

-- recordes_da_liga: igual à do 89_tecnico_e_recordes.sql; com p_clube, os quatro recordes vêm do clube (guardados + temporada atual)
create or replace function public.recordes_da_liga(p_liga bigint, p_clube bigint default null) returns jsonb
language sql stable security definer set search_path = public as $$
with atual as (select temporada as t from ligas where id = p_liga),
num as ( -- temporadas guardadas, mais a atual (a atual conta para o clube de hoje)
  select h.jogador_id, h.clube_id, h.jogos, h.gols from jogadores_historico h where h.liga_id = p_liga and h.temporada < (select t from atual)
  union all
  select j.id, j.clube_id, n.jogos, n.gols from numeros_dos_jogadores(p_liga) n
    join jogadores j on j.id = nullif(regexp_replace(n.jid, '\D', '', 'g'), '')::bigint
), tot as (
  select jogador_id, sum(jogos)::int as jogos, sum(gols)::int as gols from num where p_clube is null or clube_id = p_clube group by 1
), quem as ( -- os 10 que mais jogaram e os 10 que mais marcaram
  (select 'jogos' as lista, * from tot where jogos > 0 order by jogos desc, gols desc limit 10)
  union all (select 'gols', * from tot where gols > 0 order by gols desc, jogos asc limit 10)
), nomes as ( -- quem se aposentou não está mais em jogadores: o nome vem das listas de artilheiros guardadas
  select q.*, coalesce(j.nome, (select x->>'nome' from estatisticas_historico e cross join lateral jsonb_array_elements(e.dados->'artilheiros') x
      where e.liga_id = p_liga and x->>'id' = 'j' || q.jogador_id limit 1)) as nome, j.pos, j.clube_id as clube
    from quem q left join jogadores j on j.id = q.jogador_id
), rec as ( -- comp nulo: cada recorde traz o seu (os dos clubes juntam liga e copas)
  select e.temporada, e.comp, e.dados->'recordes' as r from estatisticas_historico e where p_clube is null and e.liga_id = p_liga and e.comp in ('TODOS', 'COPA') and e.temporada < (select t from atual)
  union all select (select t from atual), 'TODOS', estatisticas_da_liga(p_liga, 'TODOS')->'recordes' where p_clube is null
  union all select (select t from atual), 'COPA', estatisticas_da_liga(p_liga, 'COPA')->'recordes' where p_clube is null
  union all select e.temporada, null, e.dados->(p_clube::text) from estatisticas_historico e where p_clube is not null and e.liga_id = p_liga and e.comp = 'CLUBES' and e.temporada < (select t from atual)
  union all select (select t from atual), null, recordes_dos_clubes(p_liga, p_clube)->(p_clube::text) where p_clube is not null
)
select jsonb_build_object(
  'jogos', (select coalesce(jsonb_agg(to_jsonb(q) order by q.jogos desc, q.gols desc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, gols from nomes where lista = 'jogos') q),
  'gols', (select coalesce(jsonb_agg(to_jsonb(q) order by q.gols desc, q.jogos asc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, gols from nomes where lista = 'gols') q),
  'goleada', (select r->'goleada' || jsonb_build_object('temporada', temporada, 'comp', coalesce(comp, r->'goleada'->>'comp')) from rec
      where jsonb_typeof(r->'goleada') = 'object' and (r->'goleada'->>'gols_casa') <> (r->'goleada'->>'gols_fora')
      order by abs((r->'goleada'->>'gols_casa')::int - (r->'goleada'->>'gols_fora')::int) desc, (r->'goleada'->>'gols_casa')::int + (r->'goleada'->>'gols_fora')::int desc, temporada limit 1),
  'gols_jogo', (select r->'gols' || jsonb_build_object('temporada', temporada, 'comp', coalesce(comp, r->'gols'->>'comp')) from rec where jsonb_typeof(r->'gols') = 'object'
      order by (r->'gols'->>'gols_casa')::int + (r->'gols'->>'gols_fora')::int desc, temporada limit 1),
  'publico', (select r->'publico' || jsonb_build_object('temporada', temporada, 'comp', coalesce(comp, r->'publico'->>'comp')) from rec where jsonb_typeof(r->'publico') = 'object'
      order by (r->'publico'->>'publico')::numeric desc, temporada limit 1),
  'nota', (select r->'nota' || jsonb_build_object('temporada', temporada, 'comp', coalesce(comp, r->'nota'->>'comp')) from rec where jsonb_typeof(r->'nota') = 'object'
      order by (r->'nota'->>'nota')::numeric desc, temporada limit 1),
  'campanha', (select to_jsonb(h) from historico h where p_clube is not null and h.liga_id = p_liga and h.clube_id = p_clube order by h.divisao, h.posicao, h.pontos desc limit 1),
  'ataque', (select to_jsonb(h) from historico h where p_clube is not null and h.liga_id = p_liga and h.clube_id = p_clube order by h.gols_pro desc limit 1)
)
$$;
revoke execute on function public.recordes_da_liga(bigint, bigint) from public;
grant execute on function public.recordes_da_liga(bigint, bigint) to anon, authenticated, service_role;
