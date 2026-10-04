-- Trem Soccer · agenda a função "rodada" para rodar a cada minuto.
-- Executar no SQL Editor DEPOIS de publicar a função "rodada" e desligar o "Verify JWT" dela.
-- Pode ser executado mais de uma vez. Para parar o agendamento: select cron.unschedule('trem-rodada');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'trem-rodada';

select cron.schedule(
  'trem-rodada',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://gqsvsvrclyiroehymuot.supabase.co/functions/v1/rodada',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

select jobname, schedule, active from cron.job where jobname = 'trem-rodada';
