-- Trem Soccer · foto do início da temporada: a nota e a soma dos atributos de cada jogador logo depois da virada.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Serve para medir quanto cada jogador evoluiu com o treino ao longo da temporada (a página do clube mostra "desde o início
-- da temporada") e para conferir, no fim, se o ritmo do treino está no ponto. A página do administrador grava a foto logo
-- depois da virada. Jogador que chega no meio da temporada (peneira, reposição) fica sem foto até a virada seguinte.

alter table public.jogadores add column if not exists inicio_temporada jsonb; -- { "t": temporada, "nota": 27.5, "soma": 412 }

-- p_lista: [{ "id": 123, "nota": 27.5, "soma": 412 }]. Só administrador.
create or replace function public.marcar_inicio_da_temporada(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  update jogadores j set inicio_temporada = jsonb_build_object('t', v_temp, 'nota', x.nota, 'soma', x.soma)
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, nota numeric, soma int)
    where j.id = x.id and (j.clube_id in (select id from clubes where liga_id = p_liga) or j.livre_liga = p_liga);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.marcar_inicio_da_temporada(bigint, jsonb) from public, anon;
grant execute on function public.marcar_inicio_da_temporada(bigint, jsonb) to authenticated;
