-- Trem Soccer · playoffs de acesso criados sozinhos pelo servidor.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Pode ser executado mais de uma vez.
--
-- A função "rodada" passa a criar as semifinais quando a fase de liga termina, e as finais quando as semifinais terminam, uma data depois.
-- Este índice só garante que o mesmo jogo de playoff não seja criado duas vezes se duas chamadas do servidor chegarem ao mesmo tempo.
-- O botão "Gerar playoffs" do administrador continua valendo, para antecipar ou escolher outra hora.

create unique index if not exists partidas_playoff_unico on public.partidas (liga_id, grupo, fase, casa, fora) where fase in ('semi', 'final');
