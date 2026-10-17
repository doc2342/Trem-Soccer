-- 108: devolve ao agendamento trem-rodada o comando do 67_cron_enxuto.sql: chamada à função "rodada" + "where public.tarefas_do_minuto()".
-- O 104, o 105 e o 106 acrescentaram um SEGUNDO "where" depois desse (erro "syntax error at or near where": nada rodava no servidor).
-- Eles eram desnecessários: tarefas_do_minuto() já só chama a função quando há trabalho e fecha leilões, copa e bots no próprio banco.
-- Como usar: SQL Editor, colar este arquivo inteiro e Run. Pode rodar mais de uma vez. Não exige republicar função. Mantém URL e segredo.

select cron.alter_job(jobid, command :=
  regexp_replace(split_part(command, ' where public.tarefas_do_minuto()', 1), '[[:space:];]+$', '') || ' where public.tarefas_do_minuto()')
from cron.job where jobname = 'trem-rodada';

-- conferir: o comando deve terminar em "where public.tarefas_do_minuto()", com um "where" só
select jobname, right(command, 60) as fim, (length(command) - length(replace(command, ' where ', ''))) / 7 as quantos_where
from cron.job where jobname = 'trem-rodada';
