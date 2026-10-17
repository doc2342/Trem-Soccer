-- Suas ordens nos jogos oficiais: o que aconteceu com cada substituição e ordem condicional de um clube.
-- Fica numa tabela própria porque o relatório (resultados) é público e revelaria o plano do adversário.
-- Só o dono do clube (e o admin) lê, e só depois do apito final. Quem grava é a função rodada (service_role).

create table if not exists public.ordens_partida (
  partida_id bigint not null references public.partidas on delete cascade,
  clube_id bigint not null references public.clubes on delete cascade,
  libera_em timestamptz not null,
  itens jsonb not null, -- { subs: [...], ordens: [...] }: cada item com aos (minuto em que aconteceu) ou motivo
  primary key (partida_id, clube_id)
);
alter table public.ordens_partida enable row level security;

drop policy if exists ordens_partida_dono on public.ordens_partida;
create policy ordens_partida_dono on public.ordens_partida for select to authenticated
  using (libera_em <= now() and exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists ordens_partida_admin on public.ordens_partida;
create policy ordens_partida_admin on public.ordens_partida for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
