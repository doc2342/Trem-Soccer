-- Trem Soccer · página do jogador: números da temporada e histórico por temporada (para o gráfico da nota).
-- 1. estatisticas_do_jogador: jogos, minutos, gols, assistências e nota média dele na temporada atual (liga e copas).
-- 2. jogadores_historico: uma linha por jogador por temporada, com os atributos do fim da temporada (a tela calcula a nota)
--    e os números dele. É gravada junto com as estatísticas, que a página do administrador guarda logo antes da virada.
--    O gráfico começa na primeira virada depois deste SQL: as temporadas anteriores não foram guardadas.
-- Precisa do 54_estatisticas_da_liga.sql. Não exige republicar função.

create or replace function public.numeros_dos_jogadores(p_liga bigint) returns table (jid text, jogos int, minutos int, gols int, ass int, nota numeric)
language sql stable security definer set search_path = public as $$
  select x.j->>'id', (count(*) filter (where coalesce((x.j->>'minutos')::numeric, 0) > 0))::int,
      coalesce(sum((x.j->>'minutos')::numeric), 0)::int, coalesce(sum((x.j->>'gols')::int), 0)::int, coalesce(sum((x.j->>'assistencias')::int), 0)::int,
      round(avg((x.j->>'nota')::numeric) filter (where coalesce((x.j->>'minutos')::numeric, 0) >= 30), 2)
    from partidas p join resultados r on r.partida_id = p.id
      cross join lateral jsonb_array_elements(coalesce(r.relatorio->'jogadores', '[]'::jsonb)) as x(j)
    where p.liga_id = p_liga and r.libera_em <= now()
    group by 1
$$;
revoke execute on function public.numeros_dos_jogadores(bigint) from public, anon, authenticated;

create or replace function public.estatisticas_do_jogador(p_jogador bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(n) - 'jid' from jogadores j, numeros_dos_jogadores(coalesce((select liga_id from clubes where id = j.clube_id), j.livre_liga)) n
    where j.id = p_jogador and n.jid = 'j' || p_jogador
$$;
revoke execute on function public.estatisticas_do_jogador(bigint) from public;
grant execute on function public.estatisticas_do_jogador(bigint) to anon, authenticated, service_role;

create table if not exists public.jogadores_historico (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  jogador_id bigint not null,   -- sem referência: o histórico fica mesmo depois de o jogador se aposentar
  clube_id bigint,
  idade smallint, pos text, at smallint[],
  jogos int, minutos int, gols int, ass int, nota numeric,
  primary key (liga_id, temporada, jogador_id)
);
create index if not exists jogadores_historico_jogador on public.jogadores_historico (jogador_id);
alter table public.jogadores_historico enable row level security;
drop policy if exists jogadores_historico_leitura on public.jogadores_historico;
create policy jogadores_historico_leitura on public.jogadores_historico for select using (true);

-- guardar_estatisticas: igual à do 54_estatisticas_da_liga.sql, e grava também a linha de cada jogador
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

-- reiniciar o teste (a temporada volta) apaga o histórico dos jogadores
create or replace function public.limpar_historico_dos_jogadores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.temporada < old.temporada then delete from jogadores_historico where liga_id = new.id; end if;
  return new;
end $$;
drop trigger if exists limpar_historico_dos_jogadores on public.ligas;
create trigger limpar_historico_dos_jogadores after update of temporada on public.ligas for each row execute function public.limpar_historico_dos_jogadores();
