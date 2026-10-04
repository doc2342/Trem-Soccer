-- Trem Soccer · fase 2, passo T1: treino (focos e pontos por atributo), ainda sem treinadores.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois, republicar a função "rodada": é ela que dá a sessão de treino a cada partida de liga calculada.
-- Pode ser executado mais de uma vez sem apagar dados.
--
-- As duas colunas ficam vazias de propósito para quem nunca treinou: foco vazio quer dizer foco automático da posição.
-- (Elas não podem ser obrigatórias: o reinício do teste recria os jogadores a partir do estado guardado, que não as tem.)

alter table public.jogadores add column if not exists treino jsonb;          -- { "p": "zagueiro", "c": [15, 16, 17] }: foco principal e 3 atributos complementares
alter table public.jogadores add column if not exists treino_pts smallint[]; -- pontos acumulados em cada um dos 22 atributos (0 a 99)

-- O dirigente define os focos dos seus jogadores. p_lista: [{ "id": 123, "p": "zagueiro", "c": [15, 16, 17] }]; "p" vazio volta ao foco automático.
create or replace function public.definir_treino(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_clube bigint; x record; n int := 0;
begin
  select id into v_clube from clubes where dono = auth.uid();
  if v_clube is null then raise exception 'Você não tem clube.'; end if;
  for x in select * from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as t(id bigint, p text, c jsonb) loop
    if x.p is not null and x.p not in ('goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'ponta', 'atacante', 'fisico') then raise exception 'Foco de treino desconhecido: %.', x.p; end if;
    if x.p is not null and (jsonb_typeof(x.c) is distinct from 'array' or jsonb_array_length(x.c) > 3
        or exists (select 1 from jsonb_array_elements(x.c) e where jsonb_typeof(e) <> 'number' or (e::text)::numeric not between 0 and 21)) then
      raise exception 'O foco complementar é uma lista de até 3 atributos.';
    end if;
    update jogadores set treino = case when x.p is null then null else jsonb_build_object('p', x.p, 'c', x.c) end
      where id = x.id and clube_id = v_clube;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.definir_treino(jsonb) from public, anon;
grant execute on function public.definir_treino(jsonb) to authenticated;

-- Grava o resultado das sessões de treino. Só a função do servidor chama. p_lista: [{ "id": 123, "at": [22 números], "pts": [22 números] }].
create or replace function public.aplicar_treino(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set
      at = (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.at) with ordinality as t(v, o)),
      treino_pts = (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.pts) with ordinality as t(v, o))
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, at jsonb, pts jsonb)
    where j.id = x.id and jsonb_array_length(x.at) = 22 and jsonb_array_length(x.pts) = 22;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_treino(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_treino(jsonb) to service_role;
