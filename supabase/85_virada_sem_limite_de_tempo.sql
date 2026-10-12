-- A virada passou do limite de 8 s que o Supabase dá a cada chamada de quem está logado
-- (a liga quase dobrou de tamanho com os outros países). A API aplica o limite escrito na
-- própria função chamada, então basta dar mais tempo a ela. Nada mais muda.
alter function public.virar_temporada_com_guardas(bigint, jsonb) set statement_timeout = '180s';
notify pgrst, 'reload schema';
