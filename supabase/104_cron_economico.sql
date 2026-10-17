-- 104: o agendamento da rodada (trem-rodada) para de chamar a função à toa, para gastar menos log.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não exige republicar função.
-- Pode ser executado mais de uma vez (só altera o agendamento uma vez). Mantém a URL e o segredo que já estão no agendamento.
--
-- Antes: a função rodava todo minuto, mesmo sem nada a fazer, e cada chamada gera dezenas de linhas de log.
-- Agora: todo minuto só quando há partida (ou jogo da base) para calcular ou efeitos de apito final vencidos; fora disso,
-- a cada 5 minutos (leilões, aposentadorias, copa, bots e playoffs atrasam no máximo 4 minutos).
-- Para voltar ao de antes: rodar de novo o 10_agendamento_com_segredo.sql.

select cron.alter_job(jobid, command := rtrim(rtrim(command), ';') || '
  where exists (select 1 from public.partidas where not processada and inicio <= now())
     or exists (select 1 from public.base_jogos where not processada and inicio <= now())
     or exists (select 1 from public.resultados where efeitos is not null and libera_em <= now())
     or extract(minute from now())::int % 5 = 0 -- 104')
from cron.job where jobname = 'trem-rodada' and command not like '%-- 104%';

-- o histórico do pg_cron cresce para sempre (1.440 linhas por dia): guarda só 7 dias
select cron.unschedule(jobid) from cron.job where jobname = 'trem-limpa-cron';
select cron.schedule('trem-limpa-cron', '15 7 * * *', $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$);

-- conferir: o comando do trem-rodada deve terminar com "-- 104"
select jobname, schedule, right(command, 120) as fim_do_comando from cron.job order by jobname;
