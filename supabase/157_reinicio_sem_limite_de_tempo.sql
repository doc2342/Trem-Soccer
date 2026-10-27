-- 157: o reinício passou do limite de 8 s que o Supabase dá a cada chamada de quem está logado (27/10/2026: apagar os 100 mil lances
-- e 70 mil lançamentos da T14). A API aplica o limite escrito na própria função chamada, então basta dar mais tempo a ela (como no 85).
-- Como usar: SQL Editor, colar e Run. Pode rodar mais de uma vez. Precisa do 155. Não precisa republicar função nem o site.
alter function public.reiniciar_liga(bigint, jsonb, jsonb) set statement_timeout = '180s';
notify pgrst, 'reload schema';
