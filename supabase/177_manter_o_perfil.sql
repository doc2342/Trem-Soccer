-- Trem Soccer · no teto, o dirigente escolhe: trocar atributos (o rebalanço do 08/11) ou manter o perfil (o jogador para de treinar atributos).
-- definir_treino aceita "m": true e grava { p, c, m } em jogadores.treino; sem foco escolhido, grava só { m }. O resto é igual ao 172.
-- Precisa do 172_atributos_novos.sql. Como usar: colar no SQL Editor e Run. Pode rodar mais de uma vez. Junto: colar a função rodada (src/treino.js lê o m).
create or replace function public.definir_treino(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_clube bigint; x record; n int := 0;
begin
  select id into v_clube from clubes where dono = auth.uid();
  if v_clube is null then raise exception 'Você não tem clube.'; end if;
  for x in select * from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as t(id bigint, p text, c jsonb, m boolean) loop
    if x.p is not null and x.p not in ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'ponta', 'atacante', 'fisico') then raise exception 'Foco de treino desconhecido: %.', x.p; end if;
    if x.p is not null and (jsonb_typeof(x.c) is distinct from 'array' or jsonb_array_length(x.c) > 3
        or exists (select 1 from jsonb_array_elements(x.c) e where jsonb_typeof(e) <> 'number' or (e::text)::numeric not between 0 and 24)) then
      raise exception 'O foco complementar é uma lista de até 3 atributos.';
    end if;
    update jogadores set treino = case when x.p is null then (case when x.m then '{"m": true}'::jsonb end)
                                       else jsonb_build_object('p', x.p, 'c', x.c) || case when x.m then '{"m": true}'::jsonb else '{}'::jsonb end end
      where id = x.id and clube_id = v_clube;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.definir_treino(jsonb) from public, anon;
grant execute on function public.definir_treino(jsonb) to authenticated;
