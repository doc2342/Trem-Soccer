-- 112: Copa Sul-Americana e Recopa.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 81 e do 103 já executados. Não precisa republicar a função "rodada": as duas usam fase 'lib', que ela já calcula
-- como jogo de copa (campo neutro, prorrogação, pênaltis, jogo grande, cartões que não passam de um jogo para o outro).
--
-- As três competições continentais são partidas de fase 'lib', separadas pelo grupo:
--   'LIB' Libertadores: copa_fase 3 a 6, rodada 200 + fase, datas em ligas.copa->'lib'->'datas';
--   'SUL' Sul-Americana: copa_fase 3 a 6, rodada 300 + fase, datas em ligas.copa->'sul'->'datas' (mesmos dias da Libertadores,
--         em outro horário). Vagas pela temporada anterior: 4º, 5º e 6º da Série A + vice da Copa do Brasil (já classificado:
--         o próximo da Série A ainda sem vaga) e o 4º, 5º e 6º de cada país. A página do administrador sorteia a chave inteira.
--   'REC' Recopa: um jogo só (copa_fase 6, rodada 406) em data própria depois da rodada 3: campeão da Libertadores x campeão da
--         Sul-Americana da temporada anterior. ligas.copa->'rec' existe quando o jogo foi marcado.
-- Prêmios, do fundo da liga, a quem entra na fase: Sul-Americana 70 mil nas quartas, 100 mil na semifinal, 250 mil ao vice e
-- 850 mil ao campeão (~2,06 mi por temporada); Recopa 500 mil ao campeão. Libertadores como antes.

alter table public.historico add column if not exists sul text;        -- 'campeão' ou 'vice' da Sul-Americana
alter table public.historico add column if not exists recopa boolean;  -- campeão da Recopa

-- ---------- avanço de fase e prêmios, para as três ----------
create or replace function public.continental_avancar(p_liga bigint, p_grupo text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_fase int; v_fixa boolean; v_ids bigint[]; v_data jsonb; n int := 0; i int; a bigint; b bigint; na int; nb int;
  v_valor int; v_total int := 0; v_vice bigint;
  v_k text := case p_grupo when 'LIB' then 'lib' when 'SUL' then 'sul' else 'rec' end; -- chave em ligas.copa e tipo no fundo
  v_nome text := case p_grupo when 'LIB' then 'Libertadores' when 'SUL' then 'Sul-Americana' else 'Recopa' end;
  v_base int := case p_grupo when 'LIB' then 200 when 'SUL' then 300 else 400 end;
  c_entrada int[] := case p_grupo when 'LIB' then array[0, 0, 0, 200, 300, 0] when 'SUL' then array[0, 0, 0, 70, 100, 0] else array[0, 0, 0, 0, 0, 0] end;
  v_p_campeao int := case p_grupo when 'LIB' then 2500 when 'SUL' then 850 else 500 end;
  v_p_vice int := case p_grupo when 'LIB' then 700 when 'SUL' then 250 else 0 end;
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.copa is null or v_l.copa->v_k is null or v_l.copa->v_k ? 'campeao' then return 0; end if;
  select max(copa_fase) into v_fase from partidas where liga_id = p_liga and fase = 'lib' and grupo = p_grupo;
  if v_fase is null then return 0; end if;
  if exists (select 1 from partidas where liga_id = p_liga and fase = 'lib' and grupo = p_grupo and copa_fase = v_fase and (not processada or fim > now())) then return 0; end if;
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id
             where p.liga_id = p_liga and p.fase = 'lib' and p.grupo = p_grupo and p.copa_fase = v_fase and (r.partida_id is null or r.efeitos is not null)) then return 0; end if;
  v_fixa := not exists (select 1 from partidas where liga_id = p_liga and fase = 'lib' and grupo = p_grupo and copa_fase = v_fase and chave is null);
  select array_agg(x.id order by x.ordem nulls last, random()) into v_ids from (
    select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id, p.chave as ordem
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'lib' and p.grupo = p_grupo and p.copa_fase = v_fase) x;
  if v_ids is null then return 0; end if;
  if v_fase >= 6 then
    -- final jogada: campeão e vice (a Recopa só paga o campeão)
    select case when p.casa = v_ids[1] then p.fora else p.casa end into v_vice from partidas p
      where p.liga_id = p_liga and p.fase = 'lib' and p.grupo = p_grupo and p.copa_fase = 6 limit 1;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_ids[1], v_l.temporada, v_base + 6, 'copa', v_p_campeao, v_nome || ': prêmio de campeão');
    update financas set caixa = caixa + v_p_campeao where clube_id = v_ids[1];
    v_total := v_p_campeao;
    if v_p_vice > 0 and v_vice is not null then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_vice, v_l.temporada, v_base + 6, 'copa', v_p_vice, v_nome || ': prêmio de vice-campeão');
      update financas set caixa = caixa + v_p_vice where clube_id = v_vice;
      v_total := v_total + v_p_vice;
    end if;
    v_l.copa := jsonb_set(v_l.copa, array[v_k, 'campeao'], to_jsonb(v_ids[1]));
  else
    v_data := v_l.copa->v_k->'datas'->(v_fase - 2); -- datas[0] é a das oitavas (fase 3): a posição v_fase - 2 é a da fase seguinte
    if v_data is null or array_length(v_ids, 1) < 2 then return 0; end if;
    i := 1;
    while i + 1 <= array_length(v_ids, 1) loop
      a := v_ids[i]; b := v_ids[i + 1];
      select estadio_nivel into na from clubes where id = a;
      select estadio_nivel into nb from clubes where id = b;
      if coalesce(nb, 1) > coalesce(na, 1) then a := v_ids[i + 1]; b := v_ids[i]; end if; -- joga no estádio maior; iguais, vale a ordem do sorteio
      insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, chave)
        values (p_liga, p_grupo, v_base + v_fase + 1, 'lib', v_fase + 1, a, b, (v_data->>'inicio')::timestamptz, (v_data->>'fim')::timestamptz, case when v_fixa then (i + 1) / 2 end);
      n := n + 1; i := i + 2;
    end loop;
    v_valor := c_entrada[v_fase + 1];
    if v_valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        select x, v_l.temporada, v_base + v_fase + 1, 'copa', v_valor, v_nome || ': prêmio por chegar ' || case when v_fase + 1 = 4 then 'às quartas' else 'à semifinal' end
          from unnest(v_ids) x;
      update financas set caixa = caixa + v_valor where clube_id = any(v_ids);
      v_total := v_valor * array_length(v_ids, 1);
    end if;
  end if;
  if v_total > 0 then
    -- ponytail: o fundo paga mesmo sem saldo (fica negativo). São ~8,5 mi por temporada nas três; se um dia faltar,
    -- copiar de copa_premiar a espera pelo saldo.
    perform set_config('trem.fundo', v_k, true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) - v_total, copa = v_l.copa where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return n;
end $$;
revoke execute on function public.continental_avancar(bigint, text) from public, anon, authenticated;
grant execute on function public.continental_avancar(bigint, text) to service_role;

-- copa_avancar (chamada a cada minuto) continua chamando lib_avancar, que agora cuida das três
create or replace function public.lib_avancar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
begin
  return continental_avancar(p_liga, 'LIB') + continental_avancar(p_liga, 'SUL') + continental_avancar(p_liga, 'REC');
end $$;
revoke execute on function public.lib_avancar(bigint) from public, anon, authenticated;
grant execute on function public.lib_avancar(bigint) to service_role;

-- ---------- a virada anota campeão e vice de cada uma no histórico ----------
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
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;

notify pgrst, 'reload schema';
