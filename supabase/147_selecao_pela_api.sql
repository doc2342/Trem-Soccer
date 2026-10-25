-- Trem Soccer · seleção da temporada chamada pela API.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 145_fechamento_da_temporada.sql já executado. Não precisa republicar função nenhuma.
--
-- A selecao_da_temporada (144/145) limpava a tabela temporária com um delete sem where. Pela API (a função "rodada" e a tela do
-- administrador), o Supabase barra delete sem where, e o erro desfazia o fechamento da temporada inteiro (145): nada era gravado nem pago.
-- Pelo SQL Editor a trava não vale, por isso o teste passou. A mesma função, com "where true".

create or replace function public.selecao_da_temporada(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_t int; v_min int; n int := 0; g text; f jsonb; k int; i int; c record; v_soma numeric; v_melhor numeric; v_esc jsonb; v_melhor_esc jsonb;
  v_vagas text[]; v_usados text[];
  v_formacoes constant jsonb := '[
    ["GK","DR","DC","DC","DL","MR","MC","MC","ML","FC","SC"],
    ["GK","DR","DC","DC","DL","DMC","MC","MC","RW","LW","SC"],
    ["GK","DR","DC","DC","DL","DMC","DMC","AMR","AMC","AML","SC"],
    ["GK","DC","DC","DC","WBR","WBL","DMC","MC","MC","FC","SC"],
    ["GK","DR","DC","DC","DL","MR","MC","DMC","MC","ML","SC"],
    ["GK","DR","DC","DC","DL","MR","MC","ML","FC","FC","FC"],
    ["GK","DR","DC","DC","DL","DMC","MR","MC","MC","ML","SC"],
    ["GK","DR","DC","DC","DL","MR","MC","MC","ML","AMC","SC"],
    ["GK","DR","DC","DC","DL","MC","MC","MC","AMC","AMC","SC"],
    ["GK","DC","DC","DC","WBR","WBL","MR","MC","MC","ML","SC"],
    ["GK","DC","DC","DC","WBR","WBL","MC","MC","MC","FC","SC"],
    ["GK","DR","DC","DC","DL","DMC","MC","MC","AMC","FC","SC"]]';
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Só o administrador monta a seleção da temporada.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  select greatest(1, max(rodada) / 2) into v_min from partidas where liga_id = p_liga and fase = 'liga';
  if v_min is null then return 0; end if;
  -- candidatos: nota média nos jogos de liga com 30 minutos ou mais, a posição em que mais jogou e o clube do último jogo
  create temp table if not exists _sel_cand (grupo text, id text, nome text, pos text, clube bigint, j int, nota numeric) on commit drop;
  delete from _sel_cand where true; -- sem o where, a trava do Supabase ("DELETE requires a WHERE clause") barra a chamada pela API
  insert into _sel_cand
    select p.grupo, x.j->>'id', max(x.j->>'nome'), public.vaga_da_selecao(mode() within group (order by x.j->>'pos')),
        (array_agg(case when coalesce((x.j->>'time')::int, 0) = 0 then p.casa else p.fora end order by p.id desc))[1],
        count(*), round(avg((x.j->>'nota')::numeric), 2)
      from partidas p join resultados r on r.partida_id = p.id
        cross join lateral jsonb_array_elements(coalesce(r.relatorio->'jogadores', '[]'::jsonb)) as x(j)
      where p.liga_id = p_liga and p.fase = 'liga' and r.libera_em <= now()
        and coalesce((x.j->>'minutos')::numeric, 0) >= 30 and (x.j->>'nota') is not null
      group by p.grupo, x.j->>'id' having count(*) >= v_min;
  for g in select distinct grupo from _sel_cand loop
    v_melhor := null; v_melhor_esc := null;
    for f in select * from jsonb_array_elements(v_formacoes) loop
      v_vagas := array(select jsonb_array_elements_text(f)); v_usados := '{}'; v_soma := 0; v_esc := '[]';
      for k in 1..11 loop
        -- o par (vaga livre, jogador livre) de maior nota
        select s.i, s.vaga, cd.* into c from _sel_cand cd
          join (select o.i, o.v as vaga from unnest(v_vagas) with ordinality o(v, i) where o.v is not null) s on public.vaga_da_selecao(s.vaga) = cd.pos
          where cd.grupo = g and cd.id <> all(v_usados)
          order by cd.nota desc, cd.j desc, cd.id, s.i limit 1;
        exit when not found;
        v_vagas[c.i] := null; v_usados := v_usados || c.id; v_soma := v_soma + c.nota;
        v_esc := v_esc || jsonb_build_object('i', c.i, 'vaga', c.vaga, 'id', c.id, 'nome', c.nome, 'clube', c.clube, 'nota', c.nota);
      end loop;
      if jsonb_array_length(v_esc) = 11 and (v_melhor is null or v_soma > v_melhor) then v_melhor := v_soma; v_melhor_esc := v_esc; end if;
    end loop;
    if v_melhor_esc is null then continue; end if;
    -- sel01 a sel11 na ordem da formação (goleiro, defesa, meio, ataque)
    insert into premios_individuais (liga_id, temporada, comp, premio, jogador_id, jogador, pos, clube_id, valor, numero)
      select p_liga, v_t, g, 'sel' || lpad((e->>'i'), 2, '0'), e->>'id', e->>'nome', e->>'vaga', (e->>'clube')::bigint, 0, (e->>'nota')::numeric
        from jsonb_array_elements(v_melhor_esc) e
      on conflict do nothing;
    get diagnostics i = row_count; n := n + i;
  end loop;
  return n;
end $$;
