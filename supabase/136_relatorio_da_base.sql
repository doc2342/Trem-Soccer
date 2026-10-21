-- 136 · Relatório completo das partidas da base: o mesmo da liga principal (zonas, notas, análise, gráficos) e a narração lance a lance.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Pode ser executado mais de uma vez sem apagar dados.
--
-- Fica numa coluna própria, fora de "dados": as telas que listam os jogos da temporada leem "dados" de todos de uma vez, e o relatório
-- (uns 45 KB por jogo, ~7 KB comprimido) só é buscado quando alguém abre a partida. Jogos já jogados ficam sem relatório (só o curto).
alter table public.base_jogos add column if not exists relatorio jsonb;
