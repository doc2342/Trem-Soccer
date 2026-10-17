-- Trem Soccer · o administrador pode escolher qual bot vira o clube extra (17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 95 e do 96.
--
-- aprovar_pedido_extra ganha p_clube (opcional): sem ele, sorteia um clube sem dono do país, como antes;
-- com ele, usa esse clube, se for sem dono e do país pedido. Troca no texto da versão no ar, como o 91 e o 96 fizeram.

do $$
declare d text;
begin
  if exists (select 1 from pg_proc where proname = 'aprovar_pedido_extra' and pronargs = 3) then return; end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'aprovar_pedido_extra' and p.pronargs = 2;
  if d is null then raise exception 'aprovar_pedido_extra não existe: rode o 95 antes.'; end if;
  if position('(p_user uuid, p_elenco jsonb)' in d) = 0 or position('order by random()' in d) = 0 then
    raise exception 'Não reconheci aprovar_pedido_extra: avise o Claude.'; end if;
  d := replace(d, '(p_user uuid, p_elenco jsonb)', '(p_user uuid, p_elenco jsonb, p_clube bigint DEFAULT NULL)');
  d := replace(d, 'order by random()', 'and (p_clube is null or id = p_clube) order by random()');
  drop function public.aprovar_pedido_extra(uuid, jsonb);
  execute d;
end $$;
revoke execute on function public.aprovar_pedido_extra(uuid, jsonb, bigint) from public, anon;
grant execute on function public.aprovar_pedido_extra(uuid, jsonb, bigint) to authenticated;
