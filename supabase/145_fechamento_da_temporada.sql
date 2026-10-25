-- Trem Soccer · fechamento da temporada: campeões e prêmios uma hora depois do último jogo, sem esperar a virada.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 141 e do 144 já executados. Depois: republicar a função "rodada" e publicar o site.
--
-- Antes: a tabela final ia para o histórico (a lista de campeões) e os prêmios eram pagos só quando o administrador confirmava a virada.
-- Agora a função "rodada", uma hora depois do fim do último jogo da temporada (com os playoffs todos jogados), chama fechar_temporada(), que:
--   1. grava a tabela final no histórico (sem o destino de quem sobe e quem cai) e paga o prêmio da liga;
--   2. marca no histórico os campeões e vices da Copa, da Supercopa, da Libertadores, da Sul-Americana e da Recopa;
--   3. guarda as estatísticas e paga os prêmios do fundo (mérito da Série C, individuais, liga de base), a seleção e o técnico do ano;
--   4. paga o bônus de patrocínio de quem cumpriu a meta de posição.
-- A virada continua com o administrador: se a temporada já foi fechada, ela só completa o destino no histórico e segue com o resto
-- (desconto do prêmio antecipado, imposto, confiança da diretoria, envelhecimento, aposentadorias, acesso e descenso).
-- Prêmio da seleção, do técnico, da liga de base e de patrocínio passam a aceitar a chamada do servidor (service_role), além do administrador.

alter table public.ligas add column if not exists temporada_fechada int; -- última temporada com a tabela no histórico e os prêmios pagos

-- ---------- as mesmas do 101, do 89, do 115 e do 144, aceitando também o servidor ----------
create or replace function public.premiar_liga_de_base(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_temp int; g record; v_c bigint; n int := 0; v_premio int := 200;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Só o administrador premia a liga de base.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  for g in select grupo from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null group by grupo having bool_and(processada) loop
    continue when exists (select 1 from base_campeoes where liga_id = p_liga and temporada = v_temp and grupo = g.grupo);
    select t.clube into v_c from (
      select x.clube, sum(case when x.gp > x.gc then 3 when x.gp = x.gc then 1 else 0 end) as pts, sum(x.gp - x.gc) as saldo, sum(x.gp) as gp
        from (select casa as clube, gols_casa as gp, gols_fora as gc from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null and grupo = g.grupo
              union all select fora, gols_fora, gols_casa from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null and grupo = g.grupo) x
        group by x.clube order by 2 desc, 3 desc, 4 desc, 1 limit 1) t;
    continue when v_c is null;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_temp, g.grupo, v_c);
    update financas set caixa = caixa + v_premio where clube_id = v_c;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (v_c, v_temp, null, 'merito', v_premio, 'Fundo da liga: título da liga de base');
    n := n + 1;
  end loop;
  if n > 0 then
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - n * v_premio where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return case when n = 0 then '' else n * v_premio || ' mil aos ' || n || ' campeões da liga de base.' end;
end $$;

create or replace function public.premiar_tecnicos(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Só o administrador escolhe o técnico do ano.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  insert into premios_individuais (liga_id, temporada, comp, premio, jogador_id, jogador, pos, clube_id, valor, numero)
    select p_liga, v_t, x.grupo, 'tecnico', null, case when c.dono is null then 'bot' else coalesce(nullif(c.dirigente, ''), 'dirigente') end, null, c.id, 0, x.numero
      from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(grupo text, clube_id bigint, numero numeric)
        join clubes c on c.id = x.clube_id and c.liga_id = p_liga
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.pagar_patrocinio(p_liga bigint, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_t int; r record; v_pago int; v_n int := 0; v_total int := 0;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Só o administrador paga o bônus de patrocínio.'; end if;
  select temporada into v_t from ligas where id = p_liga for update;
  for r in select p.clube_id, p.meta, p.bonus, x.posicao from patrocinios p
      join jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, posicao int) on x.clube_id = p.clube_id
      where p.liga_id = p_liga and p.temporada = v_t and p.travado and p.bonus_pago is null loop
    v_pago := case when r.posicao <= r.meta then coalesce(r.bonus, 0) else 0 end;
    update patrocinios set bonus_pago = v_pago where liga_id = p_liga and temporada = v_t and clube_id = r.clube_id;
    if v_pago > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.clube_id, v_t, null, 'patrocinio', v_pago, 'Bônus de patrocínio: meta de terminar em ' || r.meta || 'º cumprida');
      update financas set caixa = caixa + v_pago where clube_id = r.clube_id;
      v_total := v_total + v_pago; v_n := v_n + 1;
    end if;
  end loop;
  return format('Bônus de patrocínio pagos a %s clubes (%s mil).', v_n, v_total);
end $$;

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
  delete from _sel_cand;
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

-- ---------- o fechamento ----------
-- p_classificacao: as linhas de classificacaoFinal() (src/rodada.js); p_merito: meritoDaSerieC(); p_tecnicos: tecnicosDoAno().
-- Não faz nada (devolve '') se a temporada já foi fechada, mudou, ou ainda tem partida por calcular, em transmissão ou com efeitos por gravar.
create or replace function public.fechar_temporada(p_liga bigint, p_temporada int, p_classificacao jsonb, p_merito jsonb default '[]', p_tecnicos jsonb default '[]') returns text
language plpgsql security definer set search_path = public set statement_timeout = '180s' as $$
declare v_l ligas%rowtype; v_copa jsonb; v_super bigint; v_fin jsonb; v_premios int; v_texto text;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null or v_l.temporada is distinct from p_temporada or v_l.temporada_fechada is not distinct from v_l.temporada then return ''; end if;
  if not exists (select 1 from partidas where liga_id = p_liga)
     or exists (select 1 from partidas where liga_id = p_liga and (not processada or fim > now()))
     or exists (select 1 from resultados r join partidas p on p.id = r.partida_id where p.liga_id = p_liga and r.efeitos is not null) then return ''; end if;
  if jsonb_array_length(coalesce(p_classificacao, '[]'::jsonb)) = 0 then return ''; end if;

  -- 1. tabela final e prêmio da liga (o destino fica para a virada)
  insert into historico (liga_id, temporada, clube_id, divisao, grupo, posicao, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, premio)
    select p_liga, v_l.temporada, x.clube_id, x.divisao, x.grupo, x.posicao, x.pontos, x.vitorias, x.empates, x.derrotas, x.gols_pro, x.gols_contra, x.premio
    from jsonb_to_recordset(p_classificacao) as x(clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int, gols_pro int, gols_contra int, premio int)
    join clubes c on c.id = x.clube_id and c.liga_id = p_liga;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select clube_id, v_l.temporada, null, 'premio', premio, 'Prêmio da liga: ' || posicao || 'º lugar'
    from historico where liga_id = p_liga and temporada = v_l.temporada and premio > 0;
  update financas f set caixa = f.caixa + h.premio from historico h
    where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = f.clube_id;
  select coalesce(sum(premio), 0) into v_premios from historico where liga_id = p_liga and temporada = v_l.temporada;

  -- 2. copas (as mesmas contas do virar_temporada_com_guardas, do 141)
  v_copa := copa_campanhas(p_liga);
  select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) into v_super
    from partidas p join resultados r on r.partida_id = p.id
    where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = 0 limit 1;
  select coalesce(jsonb_object_agg(x.grupo, jsonb_build_array(x.v, case when x.v = x.casa then x.fora else x.casa end)), '{}') into v_fin from (
    select distinct on (p.grupo) p.grupo, p.casa, p.fora, coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as v
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = 6) x;
  if v_copa <> '{}'::jsonb then
    update historico h set copa = v_copa->>h.clube_id::text
      where h.liga_id = p_liga and h.temporada = v_l.temporada and v_copa ? h.clube_id::text;
  end if;
  if v_super is not null then
    update historico set supercopa = true where liga_id = p_liga and temporada = v_l.temporada and clube_id = v_super;
  end if;
  if v_fin ? 'LIB' then
    update historico set lib = case when clube_id = (v_fin->'LIB'->>0)::bigint then 'campeão' else 'vice' end
      where liga_id = p_liga and temporada = v_l.temporada and clube_id in ((v_fin->'LIB'->>0)::bigint, (v_fin->'LIB'->>1)::bigint);
  end if;
  if v_fin ? 'SUL' then
    update historico set sul = case when clube_id = (v_fin->'SUL'->>0)::bigint then 'campeão' else 'vice' end
      where liga_id = p_liga and temporada = v_l.temporada and clube_id in ((v_fin->'SUL'->>0)::bigint, (v_fin->'SUL'->>1)::bigint);
  end if;
  if v_fin ? 'REC' then
    update historico set recopa = true where liga_id = p_liga and temporada = v_l.temporada and clube_id = (v_fin->'REC'->>0)::bigint;
  end if;

  -- 3. estatísticas e prêmios do fundo, na mesma ordem da tela do administrador (os individuais antes da seleção e do técnico)
  perform guardar_estatisticas(p_liga);
  v_texto := concat_ws(' ', nullif(premiar_temporada(p_liga, coalesce(p_merito, '[]'::jsonb)), ''), nullif(premiar_liga_de_base(p_liga), ''));
  perform selecao_da_temporada(p_liga);
  perform premiar_tecnicos(p_liga, coalesce(p_tecnicos, '[]'::jsonb));
  -- 4. bônus de patrocínio pela posição final (pagar_patrocinio só lê clube_id e posicao de cada linha)
  v_texto := concat_ws(' ', v_texto, pagar_patrocinio(p_liga, p_classificacao));

  update ligas set temporada_fechada = v_l.temporada where id = p_liga;
  return 'Temporada ' || v_l.temporada || ' fechada: ' || v_premios || ' mil em prêmios da liga. ' || coalesce(v_texto, '');
end $$;
revoke execute on function public.fechar_temporada(bigint, int, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.fechar_temporada(bigint, int, jsonb, jsonb, jsonb) to service_role;

-- ---------- a virada (a mesma do 61): com a temporada fechada, a tabela e o prêmio já estão lá, só falta o destino ----------
create or replace function public.virar_temporada(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype;
  r record;
  v_id bigint;
  v_premios int; v_apos int; v_novos int := 0; v_mov int := 0; v_imposto int; v_terceira int; v_cota int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vira a temporada.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null then raise exception 'Liga não encontrada.'; end if;
  if (p_plano->>'temporada')::int is distinct from v_l.temporada then raise exception 'Este plano é de outra temporada. Prepare a virada de novo.'; end if;
  if not exists (select 1 from partidas where liga_id = p_liga) then raise exception 'Não há partidas nesta temporada.'; end if;
  if exists (select 1 from partidas where liga_id = p_liga and (not processada or fim > now())) then
    raise exception 'A temporada ainda não acabou: há partidas por calcular ou em transmissão.';
  end if;

  -- 1. histórico e prêmios
  if v_l.temporada_fechada is distinct from v_l.temporada then
    insert into historico (liga_id, temporada, clube_id, divisao, grupo, posicao, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, premio, destino)
      select p_liga, v_l.temporada, x.clube_id, x.divisao, x.grupo, x.posicao, x.pontos, x.vitorias, x.empates, x.derrotas, x.gols_pro, x.gols_contra, x.premio, x.destino
      from jsonb_to_recordset(p_plano->'classificacao') as x(clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int, gols_pro int, gols_contra int, premio int, destino text)
      join clubes c on c.id = x.clube_id and c.liga_id = p_liga;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select clube_id, v_l.temporada, null, 'premio', premio, 'Prêmio da liga: ' || posicao || 'º lugar'
      from historico where liga_id = p_liga and temporada = v_l.temporada and premio > 0;
    update financas f set caixa = f.caixa + h.premio from historico h
      where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = f.clube_id;
  else -- fechada pelo servidor (fechar_temporada): tabela e prêmio já gravados
    update historico h set destino = x.destino
      from jsonb_to_recordset(p_plano->'classificacao') as x(clube_id bigint, destino text)
      where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = x.clube_id;
  end if;
  select coalesce(sum(premio), 0) into v_premios from historico where liga_id = p_liga and temporada = v_l.temporada;

  -- 2. prêmio antecipado: o valor cheio sai agora
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select id, v_l.temporada, null, 'antecipacao', -premio_antecipado, 'Desconto do prêmio antecipado'
    from clubes where liga_id = p_liga and premio_antecipado > 0;
  update financas f set caixa = f.caixa - c.premio_antecipado from clubes c
    where c.liga_id = p_liga and c.premio_antecipado > 0 and c.id = f.clube_id;

  -- 3. imposto sobre o lucro da temporada (tudo o que entrou menos tudo o que saiu, prêmio incluído)
  v_imposto := 0;
  for r in select c.id, imposto_do_lucro(coalesce((select sum(valor) from lancamentos x where x.clube_id = c.id and x.temporada = v_l.temporada and x.tipo not in ('merito', 'premio_individual')), 0)::int, teto_do_clube(c.id)) as valor
           from clubes c where c.liga_id = p_liga loop
    if r.valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.id, v_l.temporada, null, 'imposto', -r.valor, 'Imposto sobre o lucro da temporada');
      update financas set caixa = caixa - r.valor where clube_id = r.id;
      v_imposto := v_imposto + r.valor;
    end if;
  end loop;

  -- 4. jogadores: quem fica, quem se aposenta, quem chega
  update jogadores j set idade = x.idade, at = array(select jsonb_array_elements_text(x.at)::smallint),
      salario = x.salario, salario_mercado = x.salario_mercado, contrato_ate = x.contrato_ate
    from jsonb_to_recordset(p_plano->'jogadores') as x(id bigint, idade int, at jsonb, salario int, salario_mercado int, contrato_ate int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);
  delete from jogadores where id in (select (jsonb_array_elements_text(p_plano->'aposentados'))::bigint)
    and clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics v_apos = row_count;
  for r in select value as v from jsonb_array_elements(p_plano->'novos') loop
    if not exists (select 1 from clubes where id = (r.v->>'clube_id')::bigint and liga_id = p_liga) then continue; end if;
    -- juvenil só entra se houver vaga entre os 25 (60_juvenis_e_formador.sql)
    if coalesce((r.v->>'juvenil')::boolean, false) and (select count(*) from jogadores where clube_id = (r.v->>'clube_id')::bigint and juvenil) >= 25 then continue; end if;
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, juvenil, formador)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int,
        coalesce((r.v->>'juvenil')::boolean, false), (r.v->>'clube_id')::bigint)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    v_novos := v_novos + 1;
  end loop;
  update jogadores set amarelos = 0,
      fora_jogos = case when fora_motivo = 'suspensão' then 0 else fora_jogos end,
      fora_motivo = case when fora_motivo = 'suspensão' then null else fora_motivo end
    where clube_id in (select id from clubes where liga_id = p_liga);

  -- 5. acesso e descenso
  update clubes set paraquedas = null, carne = 0, premio_antecipado = 0 where liga_id = p_liga;
  for r in select * from jsonb_to_recordset(coalesce(p_plano->'movimentos', '[]'::jsonb)) as x(clube_id bigint, grupo text, divisao int, caiu boolean) loop
    update clubes c set grupo = r.grupo, divisao = r.divisao,
        paraquedas = case when r.caiu then v_l.temporada + 1 else null end,
        torcida = round(c.torcida::numeric
          * (select torcida_base from divisoes where liga_id = p_liga and divisao = r.divisao)
          / greatest(1, (select torcida_base from divisoes where liga_id = p_liga and divisao = c.divisao)))
      where c.id = r.clube_id and c.liga_id = p_liga;
    v_mov := v_mov + 1;
  end loop;

  -- 6. fundo da liga: metade do imposto vai, por igual, para os clubes da terceira divisão da temporada que começa;
  --    a outra metade fica guardada para a segunda taça
  select count(*) into v_terceira from clubes where liga_id = p_liga and divisao = 3;
  v_cota := 0; -- desde o 58_fundo_e_premios.sql o imposto inteiro vai para o fundo da liga; a Série C recebe bônus por mérito
  if v_cota > 0 then
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select id, v_l.temporada + 1, null, 'fundo', v_cota, 'Fundo da liga (imposto da temporada ' || v_l.temporada || ')'
      from clubes where liga_id = p_liga and divisao = 3;
    update financas f set caixa = f.caixa + v_cota from clubes c where c.liga_id = p_liga and c.divisao = 3 and c.id = f.clube_id;
  end if;

  delete from partidas where liga_id = p_liga;
  update ligas set temporada = temporada + 1, fundo_taca = fundo_taca + (v_imposto - v_cota * v_terceira) where id = p_liga;
  return 'Temporada ' || v_l.temporada || ' encerrada: ' || v_premios || ' mil em prêmios, ' || v_imposto || ' mil de imposto (tudo para o fundo da liga), ' || v_mov || ' clubes mudam de divisão, ' || v_apos || ' aposentados e ' || v_novos
    || ' jovens. Começa a temporada ' || (v_l.temporada + 1) || '.';
end $$;

notify pgrst, 'reload schema';
