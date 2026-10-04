-- Trem Soccer · passo I: pausar a liga, liberar clube, refazer partida e backup diário.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Executar ANTES de publicar de novo a função "rodada" e DEPOIS de publicar a função "backup".
-- Pode ser executado mais de uma vez sem apagar dados.

-- ---------- pausa ----------
alter table public.ligas add column if not exists pausada boolean not null default false;
alter table public.ligas add column if not exists pausada_em timestamptz;

-- Pausa ou retoma a liga mais recente. Ao retomar, as partidas ainda não calculadas são adiadas pelo tempo que a pausa durou.
create or replace function public.pausar_liga(p_pausar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_liga bigint := (select max(id) from ligas);
  v_desde timestamptz;
begin
  if not public.eh_admin() then raise exception 'Só o administrador pausa a liga.'; end if;
  if p_pausar then
    update ligas set pausada = true, pausada_em = now() where id = v_liga and not pausada;
  else
    select pausada_em into v_desde from ligas where id = v_liga and pausada;
    if v_desde is not null then
      update partidas set inicio = inicio + (now() - v_desde), fim = fim + (now() - v_desde) where liga_id = v_liga and not processada;
    end if;
    update ligas set pausada = false, pausada_em = null where id = v_liga;
  end if;
end $$;
revoke execute on function public.pausar_liga(boolean) from public, anon;
grant execute on function public.pausar_liga(boolean) to authenticated;

-- com a liga pausada a tática fica aberta
create or replace function public.tatica_fechada(p_clube bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partidas p join ligas l on l.id = p.liga_id
    where (p.casa = p_clube or p.fora = p_clube) and not p.processada and not l.pausada
      and p.inicio - make_interval(secs => l.prazo_escalacao_seg) <= now()
  )
$$;

-- ---------- o administrador pode apagar a tática e o pedido de um clube que ele libera ----------
drop policy if exists taticas_admin on public.taticas;
create policy taticas_admin on public.taticas for delete to authenticated using (public.eh_admin());

do $$ begin
  if to_regclass('public.pedidos') is not null then
    execute 'drop policy if exists pedidos_admin on public.pedidos';
    execute 'create policy pedidos_admin on public.pedidos for delete to authenticated using (public.eh_admin())';
  end if;
end $$;

-- ---------- backup diário, às 5h de Brasília ----------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'trem-backup';
select cron.schedule(
  'trem-backup',
  '0 8 * * *',
  $$ select net.http_post(
       url := 'https://gqsvsvrclyiroehymuot.supabase.co/functions/v1/backup',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);

select jobname, schedule, active from cron.job where jobname like 'trem-%' order by jobname;
