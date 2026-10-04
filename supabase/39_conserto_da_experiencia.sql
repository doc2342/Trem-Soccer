-- Trem Soccer · conserto: experiência gravada como 100 para quase todos os jogadores.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Não precisa republicar função nenhuma. Pode ser executado mais de uma vez (cada vez recomeça a experiência pela idade).
--
-- O que aconteceu: a função que grava forma, moral e experiência usava least(100, valor). Quando o valor da experiência não vinha
-- (partidas calculadas pela versão antiga da função "rodada", antes de a experiência existir), o banco ignorou o valor vazio e
-- gravou 100. Depois disso a experiência ficou presa no máximo.

-- 1. a função passa a manter a experiência como está quando o valor não vem
create or replace function public.aplicar_momento(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set
      forma = case when x.forma is null then j.forma else greatest(0, least(100, x.forma)) end,
      moral = case when x.moral is null then j.moral else greatest(0, least(100, x.moral)) end,
      exp = case when x.exp is null then j.exp else greatest(0, least(100, x.exp)) end
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, forma int, moral int, exp numeric)
    where j.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_momento(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_momento(jsonb) to service_role;

-- 2. todo mundo volta a ter a experiência estimada pela idade (8 pontos por ano acima dos 17); ela é gravada de novo na próxima partida
update public.jogadores set exp = null where exp is not null;
