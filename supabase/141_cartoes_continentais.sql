-- Trem Soccer · cartões da Libertadores e da Sul-Americana.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 112 já executado. Depois: republicar a função "rodada" e publicar o site.
--
-- Até aqui os jogos continentais (fase 'lib') não tinham cartões próprios. Agora, como na Copa do Brasil, contam à parte:
-- vermelho suspende por um jogo continental, o segundo amarelo também, e depois das quartas os amarelos zeram.
-- A suspensão da liga e a da copa não valem nesses jogos, nem estas na liga e na copa. A Recopa (jogo único) não mexe nos cartões.
-- Um clube joga só uma das duas por temporada, então as duas dividem as mesmas colunas; a virada zera tudo.

alter table public.jogadores add column if not exists amarelos_lib smallint; -- amarelos acumulados na Libertadores ou na Sul-Americana
alter table public.jogadores add column if not exists fora_lib smallint;     -- jogos continentais que ainda fica suspenso

-- Grava cartões e suspensões continentais. Só a função do servidor chama. p_lista: [{ id, amarelos, fora }].
create or replace function public.aplicar_lib(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set amarelos_lib = x.amarelos, fora_lib = x.fora
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, amarelos int, fora int)
    where j.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_lib(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_lib(jsonb) to service_role;

-- ---------- a virada (a mesma do 112) zera também os cartões continentais ----------
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public set statement_timeout = '180s' as $$
declare v_texto text; v_temporada int; v_copa jsonb; v_super bigint; v_fin jsonb;
begin
  select temporada into v_temporada from ligas where id = p_liga;
  v_copa := copa_campanhas(p_liga); -- antes da virada, que apaga as partidas
  select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) into v_super
    from partidas p join resultados r on r.partida_id = p.id
    where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = 0 limit 1;
  -- finais continentais: {grupo: [campeão, vice]}
  select coalesce(jsonb_object_agg(x.grupo, jsonb_build_array(x.v, case when x.v = x.casa then x.fora else x.casa end)), '{}') into v_fin from (
    select distinct on (p.grupo) p.grupo, p.casa, p.fora, coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as v
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = 6) x;
  perform set_config('trem.virada', '1', true);
  perform devolver_emprestados(p_liga); -- o plano da virada já foi montado com cada emprestado no clube de origem
  v_texto := virar_temporada(p_liga, p_plano);
  if v_copa <> '{}'::jsonb then
    update historico h set copa = v_copa->>h.clube_id::text
      where h.liga_id = p_liga and h.temporada = v_temporada and v_copa ? h.clube_id::text;
  end if;
  if v_super is not null then
    update historico set supercopa = true where liga_id = p_liga and temporada = v_temporada and clube_id = v_super;
  end if;
  if v_fin ? 'LIB' then
    update historico set lib = case when clube_id = (v_fin->'LIB'->>0)::bigint then 'campeão' else 'vice' end
      where liga_id = p_liga and temporada = v_temporada and clube_id in ((v_fin->'LIB'->>0)::bigint, (v_fin->'LIB'->>1)::bigint);
  end if;
  if v_fin ? 'SUL' then
    update historico set sul = case when clube_id = (v_fin->'SUL'->>0)::bigint then 'campeão' else 'vice' end
      where liga_id = p_liga and temporada = v_temporada and clube_id in ((v_fin->'SUL'->>0)::bigint, (v_fin->'SUL'->>1)::bigint);
  end if;
  if v_fin ? 'REC' then
    update historico set recopa = true where liga_id = p_liga and temporada = v_temporada and clube_id = (v_fin->'REC'->>0)::bigint;
  end if;
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null, copa = null where id = p_liga;
  update jogadores set amarelos_copa = null, fora_copa = null, copa_clube = null
    where (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga)
      and (amarelos_copa is not null or fora_copa is not null or copa_clube is not null);
  update jogadores set amarelos_lib = null, fora_lib = null
    where (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga)
      and (amarelos_lib is not null or fora_lib is not null);
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
