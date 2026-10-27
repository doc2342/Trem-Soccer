-- 156: muda o horário das partidas que faltam (26/10/2026). O pessoal escolheu jogos às 8h; se mudar de ideia no meio da temporada,
-- o admin escolhe a hora nova e tudo o que ainda não começou anda junto, pela mesma diferença: partidas da liga, copa, continentais
-- e playoffs já marcados, jogos da liga de base e as datas reservadas em ligas.copa (copa, Libertadores, Sul-Americana e playoff da B,
-- onde o servidor cria as fases seguintes). Ficam onde estão as partidas já calculadas e as com a tática fechada (perto do apito).
-- As janelas de transferência não mudam: fecham e abrem à meia-noite, e a troca é de no máximo 23h59.
-- Como usar: SQL Editor, colar este arquivo inteiro e Run. Pode rodar mais de uma vez. Precisa do 61 (liga de base) já executado.
-- Não precisa republicar função. Depois, publicar o site (botão "Mudar o horário" no admin).

-- desloca as datas {inicio, fim} de uma lista que ainda vêm depois de p_desde
create or replace function public.adiar_datas(p jsonb, d interval, p_desde timestamptz) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(case when (x->>'inicio')::timestamptz > p_desde
    then x || jsonb_build_object('inicio', (x->>'inicio')::timestamptz + d, 'fim', (x->>'fim')::timestamptz + d) else x end order by k), '[]'::jsonb)
  from jsonb_array_elements(p) with ordinality as t(x, k)
$$;

create or replace function public.mudar_horario_das_partidas(p_minutos int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_liga bigint := (select max(id) from ligas);
  d interval := make_interval(mins => p_minutos);
  v_desde timestamptz; v_copa jsonb; k text[]; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador muda o horário das partidas.'; end if;
  if abs(p_minutos) >= 1440 then raise exception 'A troca é de no máximo 23h59 para um lado.'; end if;
  if p_minutos = 0 then return 0; end if;
  -- só anda o que ainda está com a tática aberta
  select now() + make_interval(secs => coalesce(prazo_escalacao_seg, 0)), copa into v_desde, v_copa from ligas where id = v_liga;
  if exists (select 1 from partidas where liga_id = v_liga and not processada and inicio > v_desde and inicio + d <= v_desde + interval '10 minutes') then
    raise exception 'Adiantando tanto, a próxima partida começaria daqui a menos de 10 minutos (ou já teria começado).';
  end if;
  update partidas set inicio = inicio + d, fim = fim + d where liga_id = v_liga and not processada and inicio > v_desde;
  get diagnostics n = row_count;
  update base_jogos set inicio = inicio + d where liga_id = v_liga and not processada and inicio > v_desde;
  if v_copa is not null then
    foreach k slice 1 in array array[['datas', ''], ['lib', 'datas'], ['sul', 'datas'], ['playoffs', '']] loop
      k := array_remove(k, '');
      if jsonb_typeof(v_copa #> k) = 'array' then v_copa := jsonb_set(v_copa, k, public.adiar_datas(v_copa #> k, d, v_desde)); end if;
    end loop;
    update ligas set copa = v_copa where id = v_liga;
  end if;
  return n;
end $$;
revoke execute on function public.mudar_horario_das_partidas(int) from public, anon;
grant execute on function public.mudar_horario_das_partidas(int) to authenticated;
