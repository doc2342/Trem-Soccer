-- 149 · Reinício da liga na temporada 0: reiniciar_liga(p_liga, p_grupos, p_jogadores) apaga todo o estado de jogo (inclusive o histórico),
-- grava os grupos e os elencos novos que o admin gera, e põe a liga na temporada 0. Sai o reiniciar_teste, o guardar_estado_inicial e a tabela estado_inicial.
-- Também troca divisao_do_grupo: não existe divisão 3 (A e países = 1; B, C, D, E, X = 2) e some a linha da divisão 3 de `divisoes`.
-- Também cria jogadores.nome_completo (nomes de camisa: o nome fica sendo o da camisa e o completo só aparece na ficha).
-- Precisa do 148 já executado. Depois: publicar o site; o botão está no admin ("Reiniciar a liga"). Faça o backup antes: não dá para desfazer.

create or replace function public.divisao_do_grupo(p_grupo text) returns smallint language sql immutable as $$
  select (case when p_grupo = 'A' or public.pais_do_grupo(p_grupo) <> 'Brasil' then 1 else 2 end)::smallint
$$;

alter table public.jogadores add column if not exists nome_completo text;

-- p_grupos: { "<clube_id>": "<grupo>" }; p_jogadores: lista no formato de elencoNovo (admin.html) + clube_id
create or replace function public.reiniciar_liga(p_liga bigint, p_grupos jsonb, p_jogadores jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  t text; v_id bigint; r record; n int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador reinicia a liga.'; end if;
  if not exists (select 1 from ligas where id = p_liga) then raise exception 'Liga não encontrada.'; end if;

  -- estado de jogo que fica pendurado em jogador ou clube (os que têm cascata saem junto com as partidas, os jogadores e os clubes)
  foreach t in array array['historico_lances', 'lancamentos', 'obras', 'ofertas_livres', 'pre_contratos', 'relatorios', 'treinadores',
                           'escalacoes', 'taticas', 'taticas_base'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where clube_id in (select id from public.clubes where liga_id = $1)', t) using p_liga;
    end if;
  end loop;
  foreach t in array array['partidas', 'historico', 'jogadores_historico', 'estatisticas_historico', 'premios_individuais', 'base_campeoes',
                           'base_jogos', 'confianca_historico', 'economia_temporadas', 'fundo_resumo', 'finais_nas_sedes', 'transferencias',
                           'propostas', 'revelados', 'safras', 'metas', 'patrocinios'] loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I where liga_id = $1', t) using p_liga; end if;
  end loop;
  delete from jogadores where livre_liga = p_liga; -- jogadores livres não têm clube
  delete from jogadores where clube_id in (select id from clubes where liga_id = p_liga);

  -- grupos novos; clube que não veio em p_grupos fica onde está. Só a identidade (nome, sigla, escudo, uniforme, cores) e o dono permanecem.
  update clubes c set grupo = coalesce(p_grupos ->> c.id::text, c.grupo) where c.liga_id = p_liga;
  update clubes c set divisao = divisao_do_grupo(c.grupo), estadio_nivel = 1, humor = 8,
    ct_nivel = 0, medico_nivel = 0, fisio_nivel = 0, base_nivel = 0, estadio_visual = null,
    paraquedas = null, carne = 0, carne_temporada = null, vermelho_rodadas = 0, premio_antecipado = 0, antecipou_temporada = null,
    confianca = 50, segundo_clube = false, multas_extra = 0, multas_extra_temporada = null,
    candidatos_em = null, peneira_temporada = null, escudo_troca = false, torcida_fator = 1, torcida_fator_temporada = null, socios_auto = false,
    torcida = coalesce((select d.torcida_base from divisoes d where d.liga_id = p_liga and d.divisao = divisao_do_grupo(c.grupo)), c.torcida)
  where c.liga_id = p_liga;
  insert into financas (clube_id, caixa) select id, 5000 from clubes where liga_id = p_liga
    on conflict (clube_id) do update set caixa = 5000;
  delete from divisoes where liga_id = p_liga and divisao = 3;

  for r in select value as v from jsonb_array_elements(p_jogadores) loop
    insert into jogadores (clube_id, nome, nome_completo, pais, idade, pos, fam, at, pe, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', r.v->>'nome_completo', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), r.v->>'pe', coalesce((r.v->>'principal')::boolean, false),
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    n := n + 1;
  end loop;

  -- temporada 0, sem pausa, fundo com 40 mi (o agente paga com ele desde o 150); temporada_fechada nula = nada fechado ainda
  update ligas set temporada = 0, pausada = false, pausada_em = null, fundo_taca = 40000, temporada_fechada = null,
    aposentadorias_em = null, janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null,
    copa = null, sedes = null
  where id = p_liga;
  return 'Liga reiniciada na temporada 0: ' || n || ' jogadores novos.';
end $$;
revoke execute on function public.reiniciar_liga(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.reiniciar_liga(bigint, jsonb, jsonb) to authenticated;

drop function if exists public.reiniciar_teste(bigint, boolean);
drop function if exists public.guardar_estado_inicial(bigint);
drop function if exists public.guardar_estado_inicial(bigint, boolean);
drop table if exists public.estado_inicial;
