-- Trem Soccer · renovação automática de contratos (decidida em 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não exige republicar função (a virada é planejada na página do administrador).
--
-- Na virada, todo contrato vencido renova sozinho por uma temporada, pelo maior entre o salário e o de mercado, respeitando o teto
-- (src/virada.js). Fica de fora quem o dono marcou como "não renovar": esse fica livre e vai a leilão.
-- 1. jogadores.nao_renovar (começa desmarcado; volta a desmarcado quando o jogador muda de clube).
-- 2. marcar_nao_renovar: só o dono do clube do jogador.

alter table public.jogadores add column if not exists nao_renovar boolean not null default false;

create or replace function public.limpar_nao_renovar() returns trigger
language plpgsql as $$
begin
  new.nao_renovar := false;
  return new;
end $$;
drop trigger if exists jogadores_limpar_nao_renovar on public.jogadores;
create trigger jogadores_limpar_nao_renovar before update of clube_id on public.jogadores for each row
  when (old.clube_id is distinct from new.clube_id) execute function public.limpar_nao_renovar();

create or replace function public.marcar_nao_renovar(p_jogador bigint, p_marcar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update jogadores j set nao_renovar = coalesce(p_marcar, false)
    from clubes c where j.id = p_jogador and c.id = j.clube_id and c.dono = auth.uid() and j.emprestado_de is null;
  if not found then raise exception 'Esse jogador não é do seu clube.'; end if;
end $$;
revoke execute on function public.marcar_nao_renovar(bigint, boolean) from public, anon;
grant execute on function public.marcar_nao_renovar(bigint, boolean) to authenticated;
