-- Trem Soccer · final do acesso: a terceira vaga na Série A.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Pode ser executado mais de uma vez.
--
-- Da Série A passam a cair 3 clubes (eram 4). Sobem os campeões da B1 e da B2 e o vencedor da final do acesso: um jogo entre os
-- vencedores dos playoffs dos dois grupos, na casa do de melhor campanha, uma data depois das finais. Empate classifica o mandante.
-- A partida é criada pela função "rodada" (ou pelo botão do administrador) com a fase 'acesso' e a rodada 21; o resto do banco já
-- trata qualquer fase que não seja 'liga' como jogo de mata-mata. Este índice só impede a criação em dobro.

drop index if exists public.partidas_playoff_unico;
create unique index if not exists partidas_playoff_unico on public.partidas (liga_id, grupo, fase, casa, fora) where fase in ('semi', 'final', 'acesso');
