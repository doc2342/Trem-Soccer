-- Trem Soccer · jogador no limite: o treino avisa quando o jogador bateu o teto e parou de evoluir.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Depois: republicar a função "rodada" e publicar o site. A marca aparece a partir da primeira rodada de liga depois disso.
--
-- O teto vem do talento, que é oculto; só a função rodada sabe quando a sessão não rendeu por causa dele (chegouAoTeto em src/treino.js).
-- A marca fica em jogadores_ocultos (só o administrador lê) e o dirigente vê apenas a do próprio elenco, por no_teto_do_elenco().
-- Quem volta a treinar (aprendeu posição nova e ganhou caminho, por exemplo) sai da marca na rodada seguinte.

alter table public.jogadores_ocultos add column if not exists no_teto boolean not null default false;

-- igual ao 59, mais a marca do teto: cada item pode trazer "teto" (true: parou no teto; false: treinou)
create or replace function public.aplicar_treino(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set
      at = (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.at) with ordinality as t(v, o)),
      treino_pts = (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.pts) with ordinality as t(v, o)),
      fam = case when x.fam is not null and x.aprende is not null and j.aprende->>'pos' = x.aprende->>'pos' then x.fam else j.fam end,
      aprende = case when x.aprende is not null and j.aprende->>'pos' = x.aprende->>'pos' then x.aprende else j.aprende end
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, at jsonb, pts jsonb, fam jsonb, aprende jsonb)
    where j.id = x.id and jsonb_array_length(x.at) = 22 and jsonb_array_length(x.pts) = 22;
  get diagnostics n = row_count;
  update jogadores_ocultos o set no_teto = x.teto
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, teto boolean)
    where o.jogador_id = x.id and x.teto is not null and o.no_teto is distinct from x.teto;
  return n;
end $$;
revoke execute on function public.aplicar_treino(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_treino(jsonb) to service_role;

-- os jogadores do meu elenco que pararam no teto
create or replace function public.no_teto_do_elenco() returns setof bigint
language sql stable security definer set search_path = public as $$
  select o.jogador_id from jogadores_ocultos o join jogadores j on j.id = o.jogador_id join clubes c on c.id = j.clube_id
  where o.no_teto and c.dono = auth.uid()
$$;
revoke execute on function public.no_teto_do_elenco() from public, anon;
grant execute on function public.no_teto_do_elenco() to authenticated;
