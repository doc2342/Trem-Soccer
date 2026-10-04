-- Trem Soccer · fase 2, passo V2: virada de temporada (versão básica, sem acesso e descenso).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 15_piramide_e_reinicio.sql já executado. Não exige publicar a função "rodada" de novo.
-- Pode ser executado mais de uma vez sem apagar dados.

-- todos leem o histórico; o administrador lê os talentos para montar a virada (já podia, pela política do 01)

-- Aplica a virada montada na página de administração (src/virada.js). Só administrador, e só com a temporada encerrada.
-- p_plano: { temporada, classificacao: [...], jogadores: [...], aposentados: [...], novos: [...] }
create or replace function public.virar_temporada(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype;
  r record;
  v_id bigint;
  v_premios int; v_apos int; v_novos int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vira a temporada.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null then raise exception 'Liga não encontrada.'; end if;
  if (p_plano->>'temporada')::int is distinct from v_l.temporada then raise exception 'Este plano é de outra temporada. Prepare a virada de novo.'; end if;
  if not exists (select 1 from partidas where liga_id = p_liga) then raise exception 'Não há partidas nesta temporada.'; end if;
  if exists (select 1 from partidas where liga_id = p_liga and (not processada or fim > now())) then
    raise exception 'A temporada ainda não acabou: há partidas por calcular ou em transmissão.';
  end if;

  -- 1. classificação final no histórico e prêmios da liga
  insert into historico (liga_id, temporada, clube_id, divisao, grupo, posicao, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, premio)
    select p_liga, v_l.temporada, x.clube_id, x.divisao, x.grupo, x.posicao, x.pontos, x.vitorias, x.empates, x.derrotas, x.gols_pro, x.gols_contra, x.premio
    from jsonb_to_recordset(p_plano->'classificacao') as x(clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int, gols_pro int, gols_contra int, premio int)
    join clubes c on c.id = x.clube_id and c.liga_id = p_liga;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select clube_id, v_l.temporada, null, 'premio', premio, 'Prêmio da liga: ' || posicao || 'º lugar'
    from historico where liga_id = p_liga and temporada = v_l.temporada and premio > 0;
  update financas f set caixa = f.caixa + h.premio from historico h
    where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = f.clube_id;
  select coalesce(sum(premio), 0) into v_premios from historico where liga_id = p_liga and temporada = v_l.temporada;

  -- 2. quem fica: idade, atributos e contrato
  update jogadores j set idade = x.idade, at = array(select jsonb_array_elements_text(x.at)::smallint),
      salario = x.salario, salario_mercado = x.salario_mercado, contrato_ate = x.contrato_ate
    from jsonb_to_recordset(p_plano->'jogadores') as x(id bigint, idade int, at jsonb, salario int, salario_mercado int, contrato_ate int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);

  -- 3. aposentados saem; os jovens entram
  delete from jogadores where id in (select (jsonb_array_elements_text(p_plano->'aposentados'))::bigint)
    and clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics v_apos = row_count;
  for r in select value as v from jsonb_array_elements(p_plano->'novos') loop
    if not exists (select 1 from clubes where id = (r.v->>'clube_id')::bigint and liga_id = p_liga) then continue; end if;
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    v_novos := v_novos + 1;
  end loop;

  -- 4. amarelos e suspensões zeram; a lesão segue para a temporada nova
  update jogadores set amarelos = 0,
      fora_jogos = case when fora_motivo = 'suspensão' then 0 else fora_jogos end,
      fora_motivo = case when fora_motivo = 'suspensão' then null else fora_motivo end
    where clube_id in (select id from clubes where liga_id = p_liga);

  -- 5. a temporada antiga sai do calendário (a classificação ficou no histórico) e a nova começa
  delete from partidas where liga_id = p_liga;
  update ligas set temporada = temporada + 1 where id = p_liga;
  return 'Temporada ' || v_l.temporada || ' encerrada: ' || v_premios || ' mil em prêmios, ' || v_apos || ' aposentados e ' || v_novos || ' jovens. Começa a temporada ' || (v_l.temporada + 1) || '.';
end $$;
revoke execute on function public.virar_temporada(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada(bigint, jsonb) to authenticated;
