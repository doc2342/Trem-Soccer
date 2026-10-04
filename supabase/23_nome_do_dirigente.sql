-- Trem Soccer · nome do dirigente, mostrado ao lado do clube.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez sem apagar dados. Não exige publicar função nenhuma.

alter table public.clubes add column if not exists dirigente text; -- nome que o dirigente escolhe para aparecer no jogo

create or replace function public.definir_dirigente(p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  p_nome := btrim(coalesce(p_nome, ''));
  if char_length(p_nome) < 2 or char_length(p_nome) > 24 then raise exception 'O nome do dirigente deve ter de 2 a 24 caracteres.'; end if;
  update clubes set dirigente = p_nome where dono = auth.uid();
  if not found then raise exception 'Você não tem clube.'; end if;
end $$;
revoke execute on function public.definir_dirigente(text) from public, anon;
grant execute on function public.definir_dirigente(text) to authenticated;

-- clube liberado pelo administrador (ou tomado por inatividade) perde o nome do dirigente antigo
create or replace function public.clube_sem_dono() returns trigger
language plpgsql as $$
begin
  if new.dono is null and old.dono is not null then new.dirigente := null; end if;
  return new;
end $$;
drop trigger if exists clubes_sem_dono on public.clubes;
create trigger clubes_sem_dono before update on public.clubes for each row execute function public.clube_sem_dono();
