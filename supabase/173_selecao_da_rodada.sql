-- Trem Soccer · seleção da rodada: os onze de melhor nota da rodada, por série. Só de honra: não grava nada, sai dos relatórios das partidas.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 144_selecao_em_formacao.sql já executado (vaga_da_selecao). Depois: publicar o site. Não precisa republicar função nenhuma.
--
-- A mesma conta da seleção da temporada (147): jogos de liga, 30 minutos ou mais, a melhor formação pela soma das notas.
-- security invoker: quem chama lê resultados pelo RLS, então nada sai antes da hora. Rodada com jogo por liberar devolve vazio.
-- Devolve [{ i, vaga, id, nome, clube, nota }], na ordem da formação; vazio quando não dá para montar os onze.

create or replace function public.selecao_da_rodada(p_liga bigint, p_grupo text, p_rodada int) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  f jsonb; k int; c record; v_soma numeric; v_melhor numeric; v_esc jsonb; v_melhor_esc jsonb := '[]'; v_vagas text[]; v_usados text[]; v_cand jsonb;
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
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id and r.libera_em <= now()
      where p.liga_id = p_liga and p.grupo = p_grupo and p.rodada = p_rodada and p.fase = 'liga' and r.partida_id is null) then return '[]'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.j->>'id', 'nome', x.j->>'nome', 'pos', public.vaga_da_selecao(x.j->>'pos'),
      'clube', case when coalesce((x.j->>'time')::int, 0) = 0 then p.casa else p.fora end, 'nota', (x.j->>'nota')::numeric)), '[]') into v_cand
    from partidas p join resultados r on r.partida_id = p.id
      cross join lateral jsonb_array_elements(coalesce(r.relatorio->'jogadores', '[]'::jsonb)) as x(j)
    where p.liga_id = p_liga and p.grupo = p_grupo and p.rodada = p_rodada and p.fase = 'liga'
      and coalesce((x.j->>'minutos')::numeric, 0) >= 30 and (x.j->>'nota') is not null;
  for f in select * from jsonb_array_elements(v_formacoes) loop
    v_vagas := array(select jsonb_array_elements_text(f)); v_usados := '{}'; v_soma := 0; v_esc := '[]';
    for k in 1..11 loop
      -- o par (vaga livre, jogador livre) de maior nota
      select s.i, s.vaga, cd.* into c from jsonb_to_recordset(v_cand) as cd(id text, nome text, pos text, clube bigint, nota numeric)
        join (select o.i, o.v as vaga from unnest(v_vagas) with ordinality o(v, i) where o.v is not null) s on public.vaga_da_selecao(s.vaga) = cd.pos
        where cd.id <> all(v_usados)
        order by cd.nota desc, cd.id, s.i limit 1;
      exit when not found;
      v_vagas[c.i] := null; v_usados := v_usados || c.id; v_soma := v_soma + c.nota;
      v_esc := v_esc || jsonb_build_object('i', c.i, 'vaga', c.vaga, 'id', c.id, 'nome', c.nome, 'clube', c.clube, 'nota', c.nota);
    end loop;
    if jsonb_array_length(v_esc) = 11 and (v_melhor is null or v_soma > v_melhor) then v_melhor := v_soma; v_melhor_esc := v_esc; end if;
  end loop;
  return (select coalesce(jsonb_agg(e order by (e->>'i')::int), '[]') from jsonb_array_elements(v_melhor_esc) e);
end $$;

grant execute on function public.selecao_da_rodada(bigint, text, int) to anon, authenticated;
