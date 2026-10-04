-- Trem Soccer · deixa o administrador ver o e-mail de quem assumiu cada clube.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Opcional: sem ele, a página de administração mostra os clubes com dirigente, mas sem o e-mail.
create or replace function public.dirigentes() returns table (clube_id bigint, email text)
language sql stable security definer set search_path = public as $$
  select c.id, u.email::text from clubes c join auth.users u on u.id = c.dono where public.eh_admin()
$$;
revoke execute on function public.dirigentes() from public, anon;
grant execute on function public.dirigentes() to authenticated;
