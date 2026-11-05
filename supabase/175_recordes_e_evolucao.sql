-- Trem Soccer · recordes do clube completos e evolução da temporada (pedidos dos amigos, 04/11).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 54, 84, 89 e 143 já executados. Não exige republicar função; publicar o site.
--
-- Parte 1, recordes do clube (Clube › Troféus):
-- 1. numeros_por_clube: os números da temporada atual de cada jogador POR CLUBE (o time do relatório), com defesas e jogos sem sofrer gol
--    (goleiro, 60 min ou mais, 0 gols sofridos). Quem trocou de clube no meio da temporada conta para cada clube só o que fez por ele.
-- 2. jogadores_historico ganha defesas e sem_sofrer; guardar_estatisticas (a do 143) grava as duas na virada.
-- 3. recordes_da_liga ganha as listas assistencias, defesas, sem_sofrer e media (maior nota média, mínimo de 10 jogos), cada item
--    { id, nome, pos, clube, v } (em media também jogos). As listas gols e jogos passam a usar a mesma conta por clube na temporada atual.
--    Nas temporadas guardadas, a linha do jogador vale para o clube em que ele estava na virada (o histórico não separa por clube).
-- Parte 2, evolução da temporada (aba Treino): ver mais abaixo.

create or replace function public.numeros_por_clube(p_liga bigint) returns table (jogador_id bigint, clube_id bigint, nome text,
  jogos int, j30 int, minutos int, gols int, ass int, defesas int, sem_sofrer int, soma_nota numeric)
language sql stable security definer set search_path = public as $$
  select nullif(regexp_replace(x.j->>'id', '\D', '', 'g'), '')::bigint, case when coalesce((x.j->>'time')::int, 0) = 0 then p.casa else p.fora end, max(x.j->>'nome'),
      (count(*) filter (where coalesce((x.j->>'minutos')::numeric, 0) > 0))::int,
      (count(*) filter (where coalesce((x.j->>'minutos')::numeric, 0) >= 30 and x.j->>'nota' is not null))::int,
      coalesce(sum((x.j->>'minutos')::numeric), 0)::int, coalesce(sum((x.j->>'gols')::int), 0)::int, coalesce(sum((x.j->>'assistencias')::int), 0)::int,
      coalesce(sum((x.j->>'defesas')::int), 0)::int,
      (count(*) filter (where x.j->>'pos' = 'GK' and coalesce((x.j->>'minutos')::numeric, 0) >= 60 and coalesce((x.j->>'sofridos')::int, 0) = 0))::int,
      coalesce(sum((x.j->>'nota')::numeric) filter (where coalesce((x.j->>'minutos')::numeric, 0) >= 30), 0)
    from partidas p join resultados r on r.partida_id = p.id
      cross join lateral jsonb_array_elements(coalesce(r.relatorio->'jogadores', '[]'::jsonb)) as x(j)
    where p.liga_id = p_liga and r.libera_em <= now() and nullif(regexp_replace(x.j->>'id', '\D', '', 'g'), '') is not null
    group by 1, 2
$$;
revoke execute on function public.numeros_por_clube(bigint) from public, anon, authenticated;

alter table public.jogadores_historico add column if not exists defesas int, add column if not exists sem_sofrer int;

-- guardar_estatisticas: igual à do 143_recordes_dos_clubes.sql, e grava também defesas e jogos sem sofrer gol
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
  insert into jogadores_historico (liga_id, temporada, jogador_id, clube_id, idade, pos, at, jogos, minutos, gols, ass, nota, defesas, sem_sofrer)
    select p_liga, v_t, j.id, j.clube_id, j.idade, j.pos, j.at, coalesce(s.jogos, 0), coalesce(s.minutos, 0), coalesce(s.gols, 0), coalesce(s.ass, 0), s.nota,
        coalesce(g.defesas, 0), coalesce(g.sem_sofrer, 0)
      from jogadores j join clubes c on c.id = j.clube_id and c.liga_id = p_liga
        left join numeros_dos_jogadores(p_liga) s on s.jid = 'j' || j.id
        left join (select n.jogador_id, sum(n.defesas)::int as defesas, sum(n.sem_sofrer)::int as sem_sofrer from numeros_por_clube(p_liga) n group by 1) g on g.jogador_id = j.id
    on conflict (liga_id, temporada, jogador_id) do update set clube_id = excluded.clube_id, idade = excluded.idade, pos = excluded.pos, at = excluded.at,
      jogos = excluded.jogos, minutos = excluded.minutos, gols = excluded.gols, ass = excluded.ass, nota = excluded.nota,
      defesas = excluded.defesas, sem_sofrer = excluded.sem_sofrer;
  return n;
end $$;
revoke execute on function public.guardar_estatisticas(bigint) from public, anon;
grant execute on function public.guardar_estatisticas(bigint) to authenticated, service_role;

-- recordes_da_liga: igual à do 143, com as listas novas; a temporada atual conta por clube (numeros_por_clube)
create or replace function public.recordes_da_liga(p_liga bigint, p_clube bigint default null) returns jsonb
language sql stable security definer set search_path = public as $$
with atual as (select temporada as t from ligas where id = p_liga),
num as ( -- temporadas guardadas (a nota média vira soma: nota × jogos), mais a atual por clube
  select h.jogador_id, h.clube_id, null::text as nome, h.jogos, case when h.nota is null then 0 else h.jogos end as j30, h.gols, h.ass, coalesce(h.defesas, 0) as defesas, coalesce(h.sem_sofrer, 0) as sem_sofrer,
      coalesce(h.nota * h.jogos, 0) as soma_nota
    from jogadores_historico h where h.liga_id = p_liga and h.temporada < (select t from atual)
  union all
  select n.jogador_id, n.clube_id, n.nome, n.jogos, n.j30, n.gols, n.ass, n.defesas, n.sem_sofrer, n.soma_nota from numeros_por_clube(p_liga) n
), tot as (
  select jogador_id, max(nome) as nome_rel, sum(jogos)::int as jogos, sum(j30)::int as j30, sum(gols)::int as gols, sum(ass)::int as ass, sum(defesas)::int as defesas,
      sum(sem_sofrer)::int as sem_sofrer, sum(soma_nota) as soma_nota
    from num where p_clube is null or clube_id = p_clube group by 1
), quem as ( -- os 10 primeiros de cada lista
  (select 'jogos' as lista, t.*, t.jogos::numeric as v from tot t where jogos > 0 order by jogos desc, gols desc limit 10)
  union all (select 'gols', t.*, t.gols from tot t where gols > 0 order by gols desc, jogos asc limit 10)
  union all (select 'ass', t.*, t.ass from tot t where ass > 0 order by ass desc, jogos asc limit 10)
  union all (select 'defesas', t.*, t.defesas from tot t where defesas > 0 order by defesas desc, jogos asc limit 10)
  union all (select 'sem_sofrer', t.*, t.sem_sofrer from tot t where sem_sofrer > 0 order by sem_sofrer desc, jogos asc limit 10)
  union all (select 'media', t.*, round(t.soma_nota / t.j30, 2) from tot t where j30 >= 10 order by t.soma_nota / t.j30 desc, j30 desc limit 10)
), nomes as ( -- quem se aposentou não está mais em jogadores: o nome vem do relatório da temporada ou das listas de artilheiros guardadas
  select q.*, coalesce(j.nome, q.nome_rel, (select x->>'nome' from estatisticas_historico e cross join lateral jsonb_array_elements(e.dados->'artilheiros') x
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
  'assistencias', (select coalesce(jsonb_agg(to_jsonb(q) order by q.v desc, q.jogos asc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, v from nomes where lista = 'ass') q),
  'defesas', (select coalesce(jsonb_agg(to_jsonb(q) order by q.v desc, q.jogos asc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, v from nomes where lista = 'defesas') q),
  'sem_sofrer', (select coalesce(jsonb_agg(to_jsonb(q) order by q.v desc, q.jogos asc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, v from nomes where lista = 'sem_sofrer') q),
  'media', (select coalesce(jsonb_agg(to_jsonb(q) order by q.v desc, q.jogos desc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, j30 as jogos, v from nomes where lista = 'media') q),
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

-- Parte 2, evolução da temporada (aba Treino: atributos, XP e nota ganhos desde o início).
-- A foto do início já existe (40_foto_do_inicio_da_temporada.sql: jogadores.inicio_temporada, gravada pela página do administrador logo
-- depois da virada). Agora ela guarda também a experiência e a idade, para a XP ganha descontar o piso pela idade do início.
-- Na T0 a experiência do início é nula: o reinício (149) criou todo mundo sem experiência, então a XP ganha da T0 conta a temporada inteira.
-- A T0 ficou sem foto (o reinício não a tirou): o administrador tira pelo botão "Foto do início" do painel; atributos e nota da T0
-- contam a partir dali.
create or replace function public.marcar_inicio_da_temporada(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  update jogadores j set inicio_temporada = jsonb_build_object('t', v_temp, 'nota', x.nota, 'soma', x.soma,
      'exp', case when v_temp = 0 then null else j.exp end, 'idade', j.idade)
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, nota numeric, soma int)
    where j.id = x.id and (j.clube_id in (select id from clubes where liga_id = p_liga) or j.livre_liga = p_liga);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.marcar_inicio_da_temporada(bigint, jsonb) from public, anon;
grant execute on function public.marcar_inicio_da_temporada(bigint, jsonb) to authenticated;
