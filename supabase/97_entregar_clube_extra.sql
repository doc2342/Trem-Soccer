-- Trem Soccer · entregar o clube extra (passo 6 do segundo clube, desenho de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 92, 95 e 96.
--
-- 1. entregar_clube_extra: o dirigente devolve um clube extra ao bot, do jeito que está (elenco, caixa, estruturas); a tática é apagada.
-- 2. Quando um clube perde o dono (entregue ou liberado pelo administrador), a pessoa só pode pedir outro clube extra
--    na temporada seguinte (dirigentes.pode_pedir_desde). Se era um clube extra, o direito volta para ela:
--    o direito é da pessoa, e quem conquistou não perde.

create or replace function public.clube_perdeu_dono() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_t int := (select temporada from ligas where id = new.liga_id);
begin
  insert into dirigentes (user_id, direitos, pode_pedir_desde) values (old.dono, case when old.extra then 1 else 0 end, v_t + 1)
    on conflict (user_id) do update set direitos = dirigentes.direitos + case when old.extra then 1 else 0 end, pode_pedir_desde = v_t + 1;
  return null;
end $$;
drop trigger if exists clubes_perdeu_dono on public.clubes;
create trigger clubes_perdeu_dono after update of dono on public.clubes for each row
  when (old.dono is not null and new.dono is null) execute function public.clube_perdeu_dono();

create or replace function public.entregar_clube_extra(p_clube bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from clubes where id = p_clube and dono = auth.uid()) then raise exception 'Esse clube não é seu.'; end if;
  if not (select extra from clubes where id = p_clube) then raise exception 'Só dá para entregar um clube extra.'; end if;
  delete from taticas where clube_id = p_clube;
  update clubes set dono = null, assumido_em = null, ultimo_acesso = null where id = p_clube;
end $$;
revoke execute on function public.entregar_clube_extra(bigint) from public, anon;
grant execute on function public.entregar_clube_extra(bigint) to authenticated;
