-- Trem Soccer · passo H: táticas, partidas, lances liberados minuto a minuto e resultados.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez sem apagar dados.

alter table public.ligas add column if not exists minutos_transmissao int not null default 105; -- duração real da transmissão de uma partida
alter table public.ligas add column if not exists prazo_escalacao_seg int not null default 900; -- a tática fecha tantos segundos antes do apito

-- tática de cada clube para o próximo jogo (escalação, banco, instruções, substituições e ordens)
create table if not exists public.taticas (
  clube_id bigint primary key references public.clubes on delete cascade,
  dados jsonb not null,
  atualizada_em timestamptz not null default now()
);

create table if not exists public.partidas (
  id bigint generated always as identity primary key,
  liga_id bigint not null references public.ligas on delete cascade,
  grupo text not null,
  rodada int not null,
  casa bigint not null references public.clubes on delete cascade,
  fora bigint not null references public.clubes on delete cascade,
  inicio timestamptz not null,
  fim timestamptz not null,
  processada boolean not null default false
);
create index if not exists partidas_liga on public.partidas (liga_id, rodada);

-- cada lance tem a hora em que passa a ser visível
create table if not exists public.lances (
  id bigint generated always as identity primary key,
  partida_id bigint not null references public.partidas on delete cascade,
  ordem int not null,
  min int not null,
  libera_em timestamptz not null,
  dados jsonb not null
);
create index if not exists lances_partida on public.lances (partida_id, ordem);

-- placar final, pontos esperados e relatório completo: só aparecem depois do apito final
create table if not exists public.resultados (
  partida_id bigint primary key references public.partidas on delete cascade,
  libera_em timestamptz not null,
  gols_casa int not null,
  gols_fora int not null,
  xg_casa real not null,
  xg_fora real not null,
  pts_esp_casa real not null,
  pts_esp_fora real not null,
  relatorio jsonb not null
);

alter table public.taticas enable row level security;
alter table public.partidas enable row level security;
alter table public.lances enable row level security;
alter table public.resultados enable row level security;

-- partidas: todos leem o calendário; só o administrador escreve
drop policy if exists partidas_ler on public.partidas;
create policy partidas_ler on public.partidas for select to anon, authenticated using (true);
drop policy if exists partidas_admin on public.partidas;
create policy partidas_admin on public.partidas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- lances e resultados: o que ainda não aconteceu no relógio fica invisível, mesmo para quem consulta o banco direto
drop policy if exists lances_ler on public.lances;
create policy lances_ler on public.lances for select to anon, authenticated using (libera_em <= now());
drop policy if exists lances_admin on public.lances;
create policy lances_admin on public.lances for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists resultados_ler on public.resultados;
create policy resultados_ler on public.resultados for select to anon, authenticated using (libera_em <= now());
drop policy if exists resultados_admin on public.resultados;
create policy resultados_admin on public.resultados for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- táticas: cada dirigente lê e escreve só a do próprio clube; o administrador lê todas para calcular a rodada
drop policy if exists taticas_ler on public.taticas;
create policy taticas_ler on public.taticas for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));

-- O clube tem jogo com a tática já fechada (dentro do prazo antes do apito, ou esperando o cálculo)?
create or replace function public.tatica_fechada(p_clube bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partidas p join ligas l on l.id = p.liga_id
    where (p.casa = p_clube or p.fora = p_clube) and not p.processada
      and p.inicio - make_interval(secs => l.prazo_escalacao_seg) <= now()
  )
$$;
grant execute on function public.tatica_fechada(bigint) to anon, authenticated;
alter table public.ligas drop column if exists prazo_escalacao_min; -- versão anterior deste arquivo usava minutos

drop policy if exists taticas_inserir on public.taticas;
create policy taticas_inserir on public.taticas for insert to authenticated
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()) and not public.tatica_fechada(clube_id));
drop policy if exists taticas_alterar on public.taticas;
create policy taticas_alterar on public.taticas for update to authenticated
  using (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()))
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()) and not public.tatica_fechada(clube_id));
