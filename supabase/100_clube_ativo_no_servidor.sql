-- Trem Soccer · clube ativo também nas funções do servidor (correção achada no teste do segundo clube, 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 92 e do 94. Depois, republicar a função mercado.
--
-- 1. As funções chamadas pelas funções do servidor (compra pela multa, peneira, juvenis…) recebem a pessoa em p_user e procuravam
--    "o clube cujo dono é p_user": com dois clubes, pegavam um ao acaso. Passam a usar o clube ativo dela (meu_clube_de).
-- 2. Compra pela multa entre clubes do mesmo dono: a mensagem passa a ser a do bloqueio (antes: "Esse jogador já é seu.").

create or replace function public.meu_clube_de(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.id from dirigentes d join clubes c on c.id = d.clube_ativo and c.dono = d.user_id where d.user_id = p_user),
    (select c.id from clubes c where c.dono = p_user order by c.assumido_em nulls last, c.id limit 1))
$$;
revoke execute on function public.meu_clube_de(uuid) from public, anon, authenticated;
grant execute on function public.meu_clube_de(uuid) to service_role;

create or replace function public.meu_clube() returns bigint
language sql stable security definer set search_path = public as $$
  select public.meu_clube_de(auth.uid())
$$;

do $$
declare r record; d text; v_trocadas text := '';
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and (p.prosrc like '%from clubes where dono = p_user;%' or p.prosrc like '%from clubes where dono = p_user for update;%') loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'from clubes where dono = p_user;', 'from clubes where id = public.meu_clube_de(p_user);');
    d := replace(d, 'from clubes where dono = p_user for update;', 'from clubes where id = public.meu_clube_de(p_user) for update;');
    if r.proname = 'comprar_pela_multa' then
      d := replace(d, 'if v_de.id = v_para.id then raise exception ''Esse jogador já é seu.''; end if;',
        'if v_de.id = v_para.id then raise exception ''Esse jogador já é seu.''; end if;
  if v_de.dono = v_para.dono then raise exception ''Negócio proibido: %.'', public.motivo_entre_meus(v_de.id, null, v_para.id, true); end if;');
    end if;
    execute d;
    v_trocadas := v_trocadas || ' ' || r.proname;
  end loop;
  raise notice 'Funções trocadas para o clube ativo:%', v_trocadas;
end $$;
