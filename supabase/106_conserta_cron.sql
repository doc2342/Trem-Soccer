-- OBSOLETO: NÃO RODAR. Quebrou o agendamento (segundo "where" depois do tarefas_do_minuto() do 67). Use o 108_cron_volta_ao_67.sql.
-- 106: conserta o agendamento trem-rodada quebrado pelo 104/105 ("syntax error at or near where").
-- O comando antigo terminava em ";" + quebra de linha; o 104 só tirava espaços, o ";" ficou antes do "where" acrescentado.
-- Como usar: SQL Editor, colar este arquivo inteiro e Run. Pode rodar mais de uma vez. Não exige republicar função.
-- Mantém a URL e o segredo: pega o comando até o "where" do 104, tira ";" e espaços/quebras do fim e põe as condições de novo.

select cron.alter_job(jobid, command :=
  regexp_replace(split_part(command, 'where exists (select 1 from public.partidas', 1), '[[:space:];]+$', '') || '
  where exists (select 1 from public.partidas where not processada and inicio <= now())
     or exists (select 1 from public.base_jogos where not processada and inicio <= now())
     or exists (select 1 from public.resultados where efeitos is not null and libera_em <= now())
     or extract(minute from now())::int % 5 = 0
     or exists (select 1 from public.jogadores x join public.ligas l on l.id = x.livre_liga
                 where x.clube_id is null and x.livre_ate is not null
                   and (x.livre_ate <= now()
                     or (x.livre_inicio + make_interval(secs => (l.horas_leilao * 2700)::int) <= now()
                         and (select count(*) from public.ofertas_livres y where y.jogador_id = x.id) = 1)))
     or exists (select 1 from public.jogadores where oferta_liga_ate <= now()) -- 104 105 106')
from cron.job where jobname = 'trem-rodada';

-- conferir: o comando deve terminar em "-- 104 105 106" e NÃO ter ";" logo antes do "where"
select jobname, command from cron.job where jobname = 'trem-rodada';
