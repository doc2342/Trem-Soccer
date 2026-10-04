-- Trem Soccer · suspensões e lesões de um jogo para o outro.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Executar ANTES de publicar de novo a função "rodada". Pode ser executado mais de uma vez sem apagar dados.
alter table public.jogadores add column if not exists fora_jogos smallint not null default 0; -- jogos da liga que o jogador ainda fica fora
alter table public.jogadores add column if not exists fora_motivo text;                      -- lesão ou suspensão
alter table public.jogadores add column if not exists amarelos smallint not null default 0;  -- amarelos acumulados; o terceiro suspende por um jogo
