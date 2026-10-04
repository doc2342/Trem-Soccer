-- Trem Soccer · fase 2, passo V3: playoffs, acesso e descenso, paraquedas.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 16_virada_de_temporada.sql já executado. Não exige publicar a função "rodada" de novo.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.

alter table public.partidas add column if not exists fase text not null default 'liga'; -- liga, semi ou final (playoff de acesso)
alter table public.clubes add column if not exists paraquedas int;                       -- temporada em que o clube rebaixado joga com paraquedas

-- Teto de folha do clube: o da sua divisão; na temporada seguinte ao rebaixamento, o da divisão de cima (paraquedas).
create or replace function public.teto_do_clube(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select d.teto_folha from divisoes d
      where d.liga_id = c.liga_id and d.divisao = case when c.paraquedas = l.temporada then greatest(1, c.divisao - 1) else c.divisao end),
    l.teto_folha)
  from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube
$$;
grant execute on function public.teto_do_clube(bigint) to anon, authenticated;

create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  v_teto := teto_do_clube(v_c.id);
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas > 0 and p_salario < v_j.salario_mercado then raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_c.id;
  if v_folha - v_j.salario + p_salario > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_teto;
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
end $$;

-- Lançamentos de uma partida. Jogo de liga: TV, patrocínio, salários, manutenção, obra, bilheteria do mandante, humor e torcida.
-- Jogo de playoff: só a bilheteria do mandante e o humor. Clube com paraquedas recebe, além da TV da sua divisão, metade da
-- diferença para a TV da divisão de cima.
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_r resultados%rowtype;
  v_c clubes%rowtype;
  v_d divisoes%rowtype;
  v_o obras%rowtype;
  v_clube bigint;
  v_tv int; v_pat int; v_folha int; v_manut int; v_total int; v_extra int;
  v_publico int; v_bilheteria int;
  v_saldo int; v_dh numeric; v_dt numeric;
  v_liga boolean;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_r from resultados where partida_id = p_partida;
  select * into v_c from clubes where id = v_p.casa;
  select * into v_d from divisoes where liga_id = v_p.liga_id and divisao = v_c.divisao;
  if v_d.liga_id is null then
    v_d.receita_tv := v_l.receita_tv; v_d.receita_patrocinio := v_l.receita_patrocinio;
    v_d.preco_ingresso := v_l.preco_ingresso; v_d.torcida_base := v_l.torcida_base;
  end if;
  v_tv := round(v_d.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_d.receita_patrocinio::numeric / v_l.rodadas_por_temporada);

  v_publico := least(5000 + 5000 * v_c.estadio_nivel,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)));
  v_bilheteria := round(v_publico * v_d.preco_ingresso / 1000.0);
  update partidas set publico = v_publico where id = p_partida;

  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    v_total := 0;
    if v_liga then
      select round(coalesce(sum(salario), 0)::numeric / v_l.rodadas_por_temporada) into v_folha from jogadores where clube_id = v_clube;
      v_manut := round(manutencao_por_temporada(v_clube)::numeric / v_l.rodadas_por_temporada);
      v_total := v_tv + v_pat - v_folha - v_manut;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_clube, v_l.temporada, v_p.rodada, 'tv', v_tv, 'Cota de TV'),
        (v_clube, v_l.temporada, v_p.rodada, 'patrocinio', v_pat, 'Patrocínio'),
        (v_clube, v_l.temporada, v_p.rodada, 'salarios', -v_folha, 'Salários dos jogadores');
      if v_manut > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'manutencao', -v_manut, 'Manutenção das estruturas');
      end if;
      -- paraquedas: metade da diferença de TV para a divisão de cima, na temporada seguinte ao rebaixamento
      select round(greatest(0, (select receita_tv from divisoes where liga_id = v_p.liga_id and divisao = c.divisao - 1) - v_d.receita_tv)::numeric / 2 / v_l.rodadas_por_temporada)
        into v_extra from clubes c where c.id = v_clube and c.paraquedas = v_l.temporada;
      if coalesce(v_extra, 0) > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'paraquedas', v_extra, 'Paraquedas de TV');
        v_total := v_total + v_extra;
      end if;
    end if;
    if v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria, 'Bilheteria (' || v_publico || ' pagantes)' || case when v_liga then '' else ' · playoff' end);
      v_total := v_total + v_bilheteria;
    end if;
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)
      on conflict (clube_id) do update set caixa = financas.caixa + v_total;

    if v_liga then
      select * into v_o from obras where clube_id = v_clube and not concluida;
      if v_o.id is not null then
        if v_o.rodadas_restantes <= 1 then
          update obras set rodadas_restantes = 0, concluida = true where id = v_o.id;
          update clubes set
            ct_nivel = case when v_o.estrutura = 'ct' then v_o.nivel_alvo else ct_nivel end,
            medico_nivel = case when v_o.estrutura = 'medico' then v_o.nivel_alvo else medico_nivel end,
            fisio_nivel = case when v_o.estrutura = 'fisio' then v_o.nivel_alvo else fisio_nivel end,
            base_nivel = case when v_o.estrutura = 'base' then v_o.nivel_alvo else base_nivel end,
            estadio_nivel = case when v_o.estrutura = 'estadio' then v_o.nivel_alvo else estadio_nivel end
          where id = v_clube;
        else
          update obras set rodadas_restantes = rodadas_restantes - 1 where id = v_o.id;
        end if;
      end if;
    end if;

    if v_r.partida_id is not null then
      v_saldo := case when v_clube = v_p.casa then v_r.gols_casa - v_r.gols_fora else v_r.gols_fora - v_r.gols_casa end;
      if v_saldo > 0 then v_dh := 1; v_dt := 0.01;
      elsif v_saldo = 0 then v_dh := case when v_clube = v_p.casa then -0.3 else 0.2 end; v_dt := 0;
      else v_dh := case when v_clube = v_p.casa then -1 else -0.7 end; v_dt := -0.01;
      end if;
      update clubes set
        humor = least(16, greatest(0, humor + v_dh + (8 - humor) * 0.05)),
        torcida = least(round(v_d.torcida_base * 1.4), greatest(round(v_d.torcida_base * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;

-- Virada com acesso e descenso. O plano traz também "movimentos": [{ clube_id, grupo, divisao, caiu }] e o destino de cada clube.
create or replace function public.virar_temporada(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype;
  r record;
  v_id bigint;
  v_premios int; v_apos int; v_novos int := 0; v_mov int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vira a temporada.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null then raise exception 'Liga não encontrada.'; end if;
  if (p_plano->>'temporada')::int is distinct from v_l.temporada then raise exception 'Este plano é de outra temporada. Prepare a virada de novo.'; end if;
  if not exists (select 1 from partidas where liga_id = p_liga) then raise exception 'Não há partidas nesta temporada.'; end if;
  if exists (select 1 from partidas where liga_id = p_liga and (not processada or fim > now())) then
    raise exception 'A temporada ainda não acabou: há partidas por calcular ou em transmissão.';
  end if;

  insert into historico (liga_id, temporada, clube_id, divisao, grupo, posicao, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, premio, destino)
    select p_liga, v_l.temporada, x.clube_id, x.divisao, x.grupo, x.posicao, x.pontos, x.vitorias, x.empates, x.derrotas, x.gols_pro, x.gols_contra, x.premio, x.destino
    from jsonb_to_recordset(p_plano->'classificacao') as x(clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int, gols_pro int, gols_contra int, premio int, destino text)
    join clubes c on c.id = x.clube_id and c.liga_id = p_liga;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select clube_id, v_l.temporada, null, 'premio', premio, 'Prêmio da liga: ' || posicao || 'º lugar'
    from historico where liga_id = p_liga and temporada = v_l.temporada and premio > 0;
  update financas f set caixa = f.caixa + h.premio from historico h
    where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = f.clube_id;
  select coalesce(sum(premio), 0) into v_premios from historico where liga_id = p_liga and temporada = v_l.temporada;

  update jogadores j set idade = x.idade, at = array(select jsonb_array_elements_text(x.at)::smallint),
      salario = x.salario, salario_mercado = x.salario_mercado, contrato_ate = x.contrato_ate
    from jsonb_to_recordset(p_plano->'jogadores') as x(id bigint, idade int, at jsonb, salario int, salario_mercado int, contrato_ate int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);

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

  update jogadores set amarelos = 0,
      fora_jogos = case when fora_motivo = 'suspensão' then 0 else fora_jogos end,
      fora_motivo = case when fora_motivo = 'suspensão' then null else fora_motivo end
    where clube_id in (select id from clubes where liga_id = p_liga);

  -- acesso e descenso: o clube muda de grupo e de divisão; a torcida acompanha o tamanho da divisão nova;
  -- quem caiu joga a temporada seguinte com paraquedas
  update clubes set paraquedas = null where liga_id = p_liga;
  for r in select * from jsonb_to_recordset(coalesce(p_plano->'movimentos', '[]'::jsonb)) as x(clube_id bigint, grupo text, divisao int, caiu boolean) loop
    update clubes c set grupo = r.grupo, divisao = r.divisao,
        paraquedas = case when r.caiu then v_l.temporada + 1 else null end,
        torcida = round(c.torcida::numeric
          * (select torcida_base from divisoes where liga_id = p_liga and divisao = r.divisao)
          / greatest(1, (select torcida_base from divisoes where liga_id = p_liga and divisao = c.divisao)))
      where c.id = r.clube_id and c.liga_id = p_liga;
    v_mov := v_mov + 1;
  end loop;

  delete from partidas where liga_id = p_liga;
  update ligas set temporada = temporada + 1 where id = p_liga;
  return 'Temporada ' || v_l.temporada || ' encerrada: ' || v_premios || ' mil em prêmios, ' || v_mov || ' clubes mudam de divisão, ' || v_apos || ' aposentados e ' || v_novos || ' jovens. Começa a temporada ' || (v_l.temporada + 1) || '.';
end $$;
revoke execute on function public.virar_temporada(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada(bigint, jsonb) to authenticated;
