-- Tática da base: o esquema é sempre o do time principal (a filosofia do clube); o dirigente pode fixar juvenis em vagas
-- desse esquema e escolher as instruções da base. As vagas que ele deixar abertas continuam sendo preenchidas sozinhas
-- (juvenis, profissionais formados no clube de até 21 anos e, por fim, garotos da escolinha).
-- dados: { fixos: { "<índice da vaga 0..10>": <id do jogador> }, instr: { mentalidade, agressividade, pressao, passe, lado, finalizar, contraAtaque, impedimento } }
-- Sem prazo de fechamento: a partida da base é calculada inteira no apito, como a da liga.
create table if not exists public.taticas_base (
  clube_id bigint primary key references public.clubes on delete cascade,
  dados jsonb not null,
  atualizada_em timestamptz not null default now()
);
alter table public.taticas_base enable row level security;

drop policy if exists taticas_base_ler on public.taticas_base;
create policy taticas_base_ler on public.taticas_base for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists taticas_base_inserir on public.taticas_base;
create policy taticas_base_inserir on public.taticas_base for insert to authenticated
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists taticas_base_alterar on public.taticas_base;
create policy taticas_base_alterar on public.taticas_base for update to authenticated
  using (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()))
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists taticas_base_apagar on public.taticas_base;
create policy taticas_base_apagar on public.taticas_base for delete to authenticated
  using (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));

-- clube que troca de dono não leva a tática da base do anterior
create or replace function public.tatica_da_base_sem_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dono is distinct from old.dono then delete from taticas_base where clube_id = new.id; end if;
  return new;
end $$;
drop trigger if exists tatica_da_base_sem_dono on public.clubes;
create trigger tatica_da_base_sem_dono after update of dono on public.clubes
  for each row execute function public.tatica_da_base_sem_dono();
