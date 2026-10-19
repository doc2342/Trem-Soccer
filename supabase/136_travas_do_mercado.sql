-- Travas do mercado na lista (jogo.html, aba Mercado): quantos jogos de liga cada jogador fez pelo clube atual nesta temporada.
-- É a mesma conta de comprar_pela_multa (76_emprestimo_e_supercopa.sql): na janela do meio, quem jogou 5 partidas de liga
-- pelo clube não vai para outro da mesma divisão. As partidas são apagadas na virada, então a conta é sempre da temporada.
-- Só volta quem tem 5 jogos ou mais (é o que a lista precisa saber).
create or replace function public.jogos_pelo_clube(p_liga bigint) returns table (jogador_id bigint, jogos int)
language sql stable security definer set search_path = public as $$
  select j.id, count(*)::int
    from partidas p join resultados r on r.partida_id = p.id
    cross join lateral jsonb_array_elements(r.relatorio->'jogadores') x
    join jogadores j on j.clube_id in (p.casa, p.fora) and x->>'id' = 'j' || j.id
   where p.liga_id = p_liga and p.fase = 'liga'
   group by j.id having count(*) >= 5;
$$;
grant execute on function public.jogos_pelo_clube(bigint) to authenticated;
