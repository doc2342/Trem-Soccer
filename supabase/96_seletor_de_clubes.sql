-- Trem Soccer · seletor de clubes (passo 5 do segundo clube, desenho de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 92 e do 95. Rodar ANTES de republicar a função rodada.
--
-- 1. clubes.extra: o clube veio de um pedido de clube extra. Clube extra não tem regra de inatividade
--    (a função rodada e a virada nunca o tratam como abandonado). Volta a false quando o clube fica sem dono.
-- 2. ativar_clube: troca o clube ativo da pessoa (só entre os clubes dela).
-- 3. minhas_pendencias: o que espera o dirigente em cada clube dele (proposta recebida, contraproposta para decidir,
--    tática nunca salva), para o ponto no escudo do seletor.

alter table public.clubes add column if not exists extra boolean not null default false;
update clubes c set extra = true from pedidos_extra p where p.estado = 'aprovado' and p.clube_id = c.id and c.dono = p.user_id and not c.extra;

-- aprovar_pedido_extra marca o clube como extra (troca no texto da versão no ar, como o 91 fez)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'aprovar_pedido_extra';
  if d is null then raise exception 'aprovar_pedido_extra não existe: rode o 95 antes.'; end if;
  if position('extra = true' in d) > 0 then return; end if;
  if position('confianca = 50, segundo_clube = false' in d) = 0 then raise exception 'Não achei onde marcar o clube extra em aprovar_pedido_extra: avise o Claude.'; end if;
  execute replace(d, 'confianca = 50, segundo_clube = false', 'extra = true, confianca = 50, segundo_clube = false');
end $$;

create or replace function public.clube_sem_dono() returns trigger
language plpgsql as $$
begin
  if new.dono is null and old.dono is not null then new.dirigente := null; new.extra := false; end if;
  return new;
end $$;

create or replace function public.ativar_clube(p_clube bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clubes where id = p_clube and dono = auth.uid()) then raise exception 'Esse clube não é seu.'; end if;
  insert into dirigentes (user_id, clube_ativo) values (auth.uid(), p_clube)
    on conflict (user_id) do update set clube_ativo = excluded.clube_ativo;
end $$;
revoke execute on function public.ativar_clube(bigint) from public, anon;
grant execute on function public.ativar_clube(bigint) to authenticated;

create or replace function public.minhas_pendencias() returns table (clube_id bigint, n int)
language sql stable security definer set search_path = public as $$
  select c.id, ((select count(*) from propostas p where p.vendedor = c.id and p.estado = 'pendente')
              + (select count(*) from propostas p where p.comprador = c.id and p.estado = 'contra')
              + (case when exists (select 1 from taticas t where t.clube_id = c.id) then 0 else 1 end))::int
    from clubes c where c.dono = auth.uid()
$$;
revoke execute on function public.minhas_pendencias() from public, anon;
grant execute on function public.minhas_pendencias() to authenticated;
