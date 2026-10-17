-- 105: com o 104, leilões e ofertas à liga podiam fechar até 4 minutos atrasados fora dos horários de jogo.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não exige republicar função.
-- Pode ser executado mais de uma vez. Precisa do 104_cron_economico.sql.
--
-- O agendamento passa a chamar a função no minuto em que há leilão para fechar, com as mesmas regras do resolver_leiloes
-- (82_mercado_entre_paises.sql): prazo vencido, ou fim da entrada de clubes novos com um lance só; e oferta à liga vencida.

select cron.alter_job(jobid, command := replace(command, ' -- 104', '
     or exists (select 1 from public.jogadores x join public.ligas l on l.id = x.livre_liga
                 where x.clube_id is null and x.livre_ate is not null
                   and (x.livre_ate <= now()
                     or (x.livre_inicio + make_interval(secs => (l.horas_leilao * 2700)::int) <= now()
                         and (select count(*) from public.ofertas_livres y where y.jogador_id = x.id) = 1)))
     or exists (select 1 from public.jogadores where oferta_liga_ate <= now()) -- 104 105'))
from cron.job where jobname = 'trem-rodada' and command like '%-- 104%' and command not like '%-- 104 105%';

-- conferir: o comando do trem-rodada deve terminar com "-- 104 105"
select jobname, right(command, 60) as fim_do_comando from cron.job where jobname = 'trem-rodada';
