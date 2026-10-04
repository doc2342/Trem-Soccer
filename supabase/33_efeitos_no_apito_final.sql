-- Trem Soccer · lesões, suspensões, amarelos, forma, moral e treino passam a valer só no apito final da partida.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois, republicar a função "rodada". Pode ser executado mais de uma vez.
--
-- Antes: tudo era gravado nos jogadores quando a partida era calculada, no minuto em que ela começa. Quem olhasse o mural do clube
-- ou o elenco durante a transmissão via os lesionados, os suspensos e os pendurados antes de o lance aparecer.
-- Agora: a função guarda essas mudanças junto do resultado e só as grava nos jogadores quando o horário de fim da partida chega.
-- (A bilheteria e os salários da rodada continuam sendo lançados no início, porque o público aparece na abertura da transmissão.)

alter table public.resultados add column if not exists efeitos jsonb; -- { situacao: [...], momento: [...], treinos: [...] }; vazio depois de aplicado
