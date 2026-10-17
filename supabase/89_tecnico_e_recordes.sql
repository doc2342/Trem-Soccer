-- Trem Soccer · técnico do ano e recordes de todas as temporadas.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não exige republicar função. Precisa do 54, do 58 e do 84.
--
-- 1. premiar_tecnicos: a página do administrador, logo antes da virada, escolhe em cada série o clube que mais superou a colocação
--    esperada pela força do elenco e grava aqui como prêmio 'tecnico' (só de honra, valor 0). O nome gravado é o do dirigente
--    naquele momento ('bot' em clube sem dono), para o histórico não mudar quando o clube trocar de mãos.
-- 2. recordes_da_liga: maior goleada, jogo com mais gols, maior público e melhor atuação de todas as temporadas guardadas mais a atual,
--    e quem mais jogou e mais marcou na liga (ou só pelo clube, com p_clube). Os números por jogador começam na primeira virada
--    depois do 84_historico_dos_jogadores.sql; antes disso só conta a temporada atual.

create or replace function public.premiar_tecnicos(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador escolhe o técnico do ano.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  insert into premios_individuais (liga_id, temporada, comp, premio, jogador_id, jogador, pos, clube_id, valor, numero)
    select p_liga, v_t, x.grupo, 'tecnico', null, case when c.dono is null then 'bot' else coalesce(nullif(c.dirigente, ''), 'dirigente') end, null, c.id, 0, x.numero
      from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(grupo text, clube_id bigint, numero numeric)
        join clubes c on c.id = x.clube_id and c.liga_id = p_liga
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.premiar_tecnicos(bigint, jsonb) from public, anon;
grant execute on function public.premiar_tecnicos(bigint, jsonb) to authenticated;

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
), rec as (
  select e.temporada, e.comp, e.dados->'recordes' as r from estatisticas_historico e where e.liga_id = p_liga and e.comp in ('TODOS', 'COPA') and e.temporada < (select t from atual)
  union all select (select t from atual), 'TODOS', estatisticas_da_liga(p_liga, 'TODOS')->'recordes' where p_clube is null
  union all select (select t from atual), 'COPA', estatisticas_da_liga(p_liga, 'COPA')->'recordes' where p_clube is null
)
select jsonb_build_object(
  'jogos', (select coalesce(jsonb_agg(to_jsonb(q) order by q.jogos desc, q.gols desc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, gols from nomes where lista = 'jogos') q),
  'gols', (select coalesce(jsonb_agg(to_jsonb(q) order by q.gols desc, q.jogos asc), '[]'::jsonb) from (select jogador_id as id, nome, pos, clube, jogos, gols from nomes where lista = 'gols') q),
  'goleada', (select r->'goleada' || jsonb_build_object('temporada', temporada, 'comp', comp) from rec
      where p_clube is null and jsonb_typeof(r->'goleada') = 'object' and (r->'goleada'->>'gols_casa') <> (r->'goleada'->>'gols_fora')
      order by abs((r->'goleada'->>'gols_casa')::int - (r->'goleada'->>'gols_fora')::int) desc, (r->'goleada'->>'gols_casa')::int + (r->'goleada'->>'gols_fora')::int desc, temporada limit 1),
  'gols_jogo', (select r->'gols' || jsonb_build_object('temporada', temporada, 'comp', comp) from rec where p_clube is null and jsonb_typeof(r->'gols') = 'object'
      order by (r->'gols'->>'gols_casa')::int + (r->'gols'->>'gols_fora')::int desc, temporada limit 1),
  'publico', (select r->'publico' || jsonb_build_object('temporada', temporada, 'comp', comp) from rec where p_clube is null and jsonb_typeof(r->'publico') = 'object'
      order by (r->'publico'->>'publico')::numeric desc, temporada limit 1),
  'nota', (select r->'nota' || jsonb_build_object('temporada', temporada, 'comp', comp) from rec where p_clube is null and jsonb_typeof(r->'nota') = 'object'
      order by (r->'nota'->>'nota')::numeric desc, temporada limit 1),
  'campanha', (select to_jsonb(h) from historico h where p_clube is not null and h.liga_id = p_liga and h.clube_id = p_clube order by h.divisao, h.posicao, h.pontos desc limit 1),
  'ataque', (select to_jsonb(h) from historico h where p_clube is not null and h.liga_id = p_liga and h.clube_id = p_clube order by h.gols_pro desc limit 1)
)
$$;
revoke execute on function public.recordes_da_liga(bigint, bigint) from public;
grant execute on function public.recordes_da_liga(bigint, bigint) to anon, authenticated, service_role;
