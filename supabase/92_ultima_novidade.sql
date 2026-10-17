-- Trem Soccer · conferência leve antes de recarregar a página do clube (economia de logs e de tráfego).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não exige republicar função.
--
-- A página do clube faz ~51 consultas a cada carga. Antes de se recarregar sozinha, ela agora pergunta só isto: a hora da última
-- novidade que mexe na tela (resultado liberado, transferência na liga, proposta do clube, lance em leilão, pedido de relatório).
-- Se a hora não mudou desde a última carga, nada é recarregado. Sem este SQL, a página recarrega como antes.

create or replace function public.ultima_novidade(p_liga bigint, p_clube bigint) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(
    (select max(r.libera_em) from resultados r join partidas p on p.id = r.partida_id where p.liga_id = p_liga and r.libera_em <= now()),
    (select max(criada_em) from transferencias where liga_id = p_liga),
    (select max(atualizada_em) from propostas where liga_id = p_liga and (comprador = p_clube or vendedor = p_clube)),
    (select max(criada_em) from ofertas_livres),
    (select max(criado_em) from relatorios)
  )
$$;
grant execute on function public.ultima_novidade(bigint, bigint) to anon, authenticated;
