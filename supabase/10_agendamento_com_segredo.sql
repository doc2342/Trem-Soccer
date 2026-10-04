-- Trem Soccer · agendamentos enviando o segredo, para as funções "rodada" e "backup" recusarem chamadas de estranhos.
--
-- Só executar quando for ligar o segredo. A ordem certa:
--   1. Publicar de novo as funções "rodada" e "backup" (as versões atuais já sabem conferir o segredo).
--   2. No painel do Supabase, em Edge Functions → Secrets, criar o segredo SEGREDO_DO_CRON com uma senha longa.
--   3. Neste arquivo, trocar as DUAS ocorrências de COLE_O_SEGREDO_AQUI pela mesma senha e executar no SQL Editor.
-- Não guardar este arquivo com a senha preenchida no repositório.
--
-- Para desligar o segredo: apagar o SEGREDO_DO_CRON em Edge Functions → Secrets. As funções voltam a aceitar qualquer chamada.
select cron.unschedule(jobid) from cron.job where jobname in ('trem-rodada', 'trem-backup');

select cron.schedule(
  'trem-rodada',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://gqsvsvrclyiroehymuot.supabase.co/functions/v1/rodada',
       headers := '{"Content-Type": "application/json", "x-segredo": "COLE_O_SEGREDO_AQUI"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

select cron.schedule(
  'trem-backup',
  '0 8 * * *',
  $$ select net.http_post(
       url := 'https://gqsvsvrclyiroehymuot.supabase.co/functions/v1/backup',
       headers := '{"Content-Type": "application/json", "x-segredo": "COLE_O_SEGREDO_AQUI"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);

select jobname, schedule, active from cron.job where jobname like 'trem-%' order by jobname;
