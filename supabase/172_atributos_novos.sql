-- Trem Soccer · Passe longo, Movimentação e Decisões: o vetor at passa a aceitar 25 atributos, e a virada T0→T1 entrega os 3 a quem tem 22.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 163. Pode rodar com a T0 em andamento: quem tem 22 continua igual.
-- Depois: republicar as funções "rodada" e "mercado" e publicar o site. Tem que estar no ar ANTES da virada T0→T1 (sem ele, a entrega falha e o admin mostra o erro).
--
-- Os novos ficam no fim do vetor (índices 22, 23 e 24): treino.c e treino_pts guardam índices.
-- O valor de cada jogador é calculado no site (atributosNovos em src/modelo.js); aqui só se grava.

alter table public.jogadores drop constraint if exists jogadores_at_check;
alter table public.jogadores add constraint jogadores_at_check check (array_length(at, 1) in (22, 25));

-- igual ao 163, aceitando 22 ou 25, com pts do mesmo tamanho de at
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
    where j.id = x.id and jsonb_array_length(x.at) in (22, 25) and jsonb_array_length(x.pts) = jsonb_array_length(x.at);
  get diagnostics n = row_count;
  update jogadores_ocultos o set no_teto = x.teto
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, teto boolean)
    where o.jogador_id = x.id and x.teto is not null and o.no_teto is distinct from x.teto;
  return n;
end $$;
revoke execute on function public.aplicar_treino(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_treino(jsonb) to service_role;

-- A entrega da virada. p_lista: [{ "id": 123, "novos": [plo, mov, dec] }]. Devolve quantos receberam.
-- Só toca em quem ainda tem 22: repetir depois de uma falha no meio do lote entrega só a quem falta.
create or replace function public.aplicar_atributos_novos(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador entrega os atributos novos.'; end if;
  update jogadores j set
      at = j.at || (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.novos) with ordinality as t(v, o)),
      treino_pts = case when j.treino_pts is null then null else j.treino_pts || array[0, 0, 0]::smallint[] end
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, novos jsonb)
    where j.id = x.id and array_length(j.at, 1) = 22;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_atributos_novos(jsonb) from public, anon;
grant execute on function public.aplicar_atributos_novos(jsonb) to authenticated;
