-- Trem Soccer · garotos da escolinha de verdade no reinício (decidido em 26/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 149 e do 133. Pode ser executado mais de uma vez. Rodar ANTES do reinício. Depois: republicar a função mercado e publicar o site.
--
-- No reinício cada clube com dirigente ganha 11 juvenis "da escolinha" (16 anos, teto baixo) e 2 juvenis comuns, para o time
-- da base não ser todo de garotos anônimos enquanto a base de nível 0 revela 1 por temporada.
-- Com o clube nos 25 juvenis, o juvenil que chega (virada ou peneira) toma a vaga do mais fraco da escolinha, que sai da liga.
-- O da escolinha (jogadores.escolinha) não assina contrato, não é vendido, emprestado nem posto à venda; só pode ser dispensado,
-- e aí sai da liga. Aos 21 a virada o aposenta (src/virada.js), em vez de deixá-lo livre.
-- reiniciar_liga: igual à do 149; o insert passa a gravar juvenil, escolinha e o formador do juvenil comum.
-- guardas_da_base: igual à do 133, com a guarda do da escolinha no começo.
-- dispensar_jogador: igual à do 133, com o da escolinha saindo da liga logo no começo.
-- receber_jovens (peneira): igual à do 60; com os 25 juvenis cheios, o jovem novo toma a vaga do mais fraco da escolinha.

alter table jogadores add column if not exists escolinha boolean not null default false;

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

  -- juvenil comum é formado no clube (entra nos revelados); o da escolinha não
  for r in select value as v from jsonb_array_elements(p_jogadores) loop
    insert into jogadores (clube_id, nome, nome_completo, pais, idade, pos, fam, at, pe, principal, salario, salario_mercado, contrato_ate, protegido_ate,
        juvenil, escolinha, formador)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', r.v->>'nome_completo', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), r.v->>'pe', coalesce((r.v->>'principal')::boolean, false),
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int,
        coalesce((r.v->>'juvenil')::boolean, false), coalesce((r.v->>'escolinha')::boolean, false),
        case when coalesce((r.v->>'juvenil')::boolean, false) and not coalesce((r.v->>'escolinha')::boolean, false) then (r.v->>'clube_id')::bigint end)
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

create or replace function public.guardas_da_base() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_temp int;
begin
  -- da escolinha: fica no clube como juvenil sem contrato até ser dispensado ou aposentado
  if coalesce(old.escolinha, false) and new.clube_id is not null
     and (new.clube_id is distinct from old.clube_id or new.salario is not null or not coalesce(new.juvenil, false) or not coalesce(new.escolinha, false)
          or (coalesce(new.a_venda, false) and not coalesce(old.a_venda, false)) or (coalesce(new.protegido, false) and not coalesce(old.protegido, false))) then
    raise exception '% é da escolinha: não assina contrato nem muda de clube; só pode ser dispensado.', old.nome;
  end if;
  if coalesce(old.juvenil, false) then
    if new.clube_id is null then new.juvenil := false; -- saiu do clube (dispensa ou virada): passa a ser um jogador livre comum
    elsif new.clube_id is distinct from old.clube_id and (coalesce(new.juvenil, false) or new.salario is null or old.idade < 18) then
      raise exception '% é juvenil, sem contrato: só muda de clube por venda negociada, a partir dos 18 anos.', old.nome;
    end if;
    if coalesce(new.a_venda, false) and not coalesce(old.a_venda, false) then raise exception '% é juvenil: profissionalize antes de pôr à venda.', old.nome; end if;
    if coalesce(new.protegido, false) and not coalesce(old.protegido, false) then raise exception '% é juvenil: já não tem multa rescisória.', old.nome; end if;
  end if;
  if new.pre_contrato is not null and new.pre_contrato is distinct from old.pre_contrato
     and (coalesce(old.juvenil, false) or (old.formador is not null and old.formador = old.clube_id and old.idade <= 21)) then
    raise exception '% foi formado no clube e tem até 21 anos: não aceita pré-contrato.', old.nome;
  end if;
  -- formado no clube: a multa só passa a valer na temporada em que ele faz 22
  if new.clube_id is not null and new.clube_id is not distinct from old.clube_id and new.formador = new.clube_id and new.idade <= 21
     and (new.protegido_ate is distinct from old.protegido_ate or new.contrato_ate is distinct from old.contrato_ate) then
    select l.temporada into v_temp from ligas l join clubes c on c.liga_id = l.id where c.id = new.clube_id;
    if v_temp is not null then new.protegido_ate := greatest(coalesce(new.protegido_ate, 0), v_temp + 21 - new.idade); end if;
  end if;
  return new;
end $$;

create or replace function public.dispensar_jogador(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype; v_multa int; v_temp int;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if coalesce(v_j.escolinha, false) then -- não fica livre: volta para a escolinha e sai da liga
    delete from jogadores where id = p_jogador;
    return v_j.nome || ' voltou para a escolinha e saiu do clube.';
  end if;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if exists (select 1 from partidas p where (p.casa = v_c.id or p.fora = v_c.id) and p.processada and p.fim > now()) then
    raise exception 'Há uma partida do seu clube em andamento. Dispense depois do apito final.';
  end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  v_multa := multa_da_dispensa(p_jogador);
  if v_multa > 0 then
    if coalesce((select caixa from financas where clube_id = v_c.id for update), 0) < v_multa then
      raise exception 'Caixa insuficiente: a rescisão de % custa % mil.', v_j.nome, v_multa;
    end if;
    update financas set caixa = caixa - v_multa where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_temp, null, 'rescisao', -v_multa, 'Rescisão de contrato (50% do salário que faltava): ' || v_j.nome);
  end if;
  update jogadores set clube_id = null, livre_liga = v_c.liga_id, livre_ate = null, livre_inicio = null, livre_abriu = null,
      salario = null, salario_mercado = coalesce(v_j.salario_mercado, v_j.salario), contrato_ate = null,
      protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null, treino = null,
      dispensado_por = v_c.id, dispensado_temporada = v_temp
    where id = p_jogador;
  return v_j.nome || ' dispensado' || case when v_multa > 0 then ' (rescisão de ' || v_multa || ' mil)' else '' end
    || ': está livre e pode ser contratado por qualquer outro clube.';
end $$;

-- receber_jovens: igual à do 60; com os 25 juvenis cheios, cada jovem da peneira toma a vaga do mais fraco da escolinha (menor soma
-- de atributos), que sai da liga. Na virada, quem abre a vaga é o plano (src/virada.js), que põe o da escolinha entre os aposentados.
create or replace function public.receber_jovens(p_user uuid, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_l ligas%rowtype; r record; v_id bigint; n int := 0; v_saiu int := 0;
begin
  select * into v_c from clubes where id = public.meu_clube_de(p_user) for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if rodadas_completas(v_l.id) < 9 then raise exception 'A peneira só acontece a partir da rodada 9.'; end if;
  if v_c.peneira_temporada is not distinct from v_l.temporada then raise exception 'A peneira desta temporada já foi feita.'; end if;
  update clubes set peneira_temporada = v_l.temporada where id = v_c.id;
  for r in select value as v from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    if (select count(*) from jogadores where clube_id = v_c.id and juvenil) >= 25 then
      delete from jogadores where id = (select id from jogadores where clube_id = v_c.id and escolinha order by (select sum(x) from unnest(at) x), id limit 1);
      if found then v_saiu := v_saiu + 1; end if;
    end if;
    exit when (select count(*) from jogadores where clube_id = v_c.id and juvenil) >= 25; -- sem vaga entre os juvenis: os que não couberem ficam de fora
    insert into jogadores (clube_id, nome, nome_completo, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, juvenil, formador)
      values (v_c.id, r.v->>'nome', r.v->>'nome_completo', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        null, (r.v->>'salario_mercado')::int, null, v_l.temporada + 21 - (r.v->>'idade')::int, true, v_c.id)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    n := n + 1;
  end loop;
  return case n when 0 then 'A peneira desta temporada não revelou ninguém.' when 1 then 'A peneira revelou 1 juvenil.' else 'A peneira revelou ' || n || ' juvenis.' end
    || case v_saiu when 0 then '' when 1 then ' Um garoto da escolinha saiu para abrir a vaga.' else ' ' || v_saiu || ' garotos da escolinha saíram para abrir as vagas.' end;
end $$;
