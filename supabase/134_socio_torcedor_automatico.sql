-- 134: Sócio-Torcedor automático (19/10/2026, decisões do usuário: sem desconto, pago por rodada, vale para bots também, 10% a 30%).
-- Na primeira partida de liga de cada temporada, todo clube do Brasil ganha sócios: de 10% (humor 0) a 30% (humor 16) da torcida,
-- até metade dos lugares do estádio. Eles vão a todos os jogos de liga em casa (o público nunca fica abaixo deles) e pagam o ingresso
-- cheio em parcelas: a cada rodada de liga, meio ingresso por sócio (metade dos jogos é em casa), menos os 10% do fundo, como a bilheteria.
-- Quem abriu o Sócio-Torcedor à mão nesta temporada (pago de uma vez) fica como está. O botão sai: definir_carne passa a recusar.
--
-- Também devolve ao lancar_rodada os remendos do 114, 115 e 122 (rodadas do grupo, patrocínio por escolha, operação do jogo):
-- o 132 recriou a função a partir do texto do 118 e eles podem ter se perdido. Só troca o que falta; pode rodar mais de uma vez.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não precisa republicar a função "rodada".

alter table public.clubes add column if not exists socios_auto boolean not null default false;

-- sócios da temporada de um clube, se ainda não tiver (chamado no início das partidas de liga)
create or replace function public.garantir_socios(p_clube bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_t int;
begin
  select * into v_c from clubes where id = p_clube for update;
  if v_c.id is null or v_c.grupo in ('ARG', 'URU', 'COL', 'CHI', 'X') then return; end if;
  select temporada into v_t from ligas where id = v_c.liga_id;
  if v_c.carne_temporada is not distinct from v_t then return; end if;
  update clubes set
    carne = least(round(coalesce(torcida, 0) * (0.10 + 0.20 * least(16, greatest(0, coalesce(humor, 8))) / 16)), lugares_do_estadio(estadio_nivel) / 2),
    carne_temporada = v_t, socios_auto = true
  where id = p_clube;
end $$;
revoke execute on function public.garantir_socios(bigint) from public, anon, authenticated;

-- parcela dos sócios numa partida de liga: meio ingresso por sócio, menos os 10% do fundo. Grava o lançamento e devolve o valor.
create or replace function public.pagar_socios(p_clube bigint, p_partida bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_p partidas%rowtype; v_l ligas%rowtype; v_preco int; v_valor int; v_taxa int;
begin
  select * into v_p from partidas where id = p_partida;
  select * into v_c from clubes where id = p_clube;
  select * into v_l from ligas where id = v_c.liga_id;
  if v_p.fase is distinct from 'liga' or not v_c.socios_auto or v_c.carne_temporada is distinct from v_l.temporada or coalesce(v_c.carne, 0) <= 0 then return 0; end if;
  select coalesce((select preco_ingresso from divisoes where liga_id = v_c.liga_id and divisao = v_c.divisao), v_l.preco_ingresso) into v_preco;
  v_valor := round(v_c.carne * v_preco / 2000.0);
  v_taxa := round(v_valor * 0.10);
  if v_taxa > 0 then
    perform set_config('trem.fundo', 'bilheteria', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) + v_taxa where id = v_l.id;
    perform set_config('trem.fundo', '', true);
  end if;
  v_valor := v_valor - v_taxa;
  if v_valor > 0 then
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (p_clube, v_l.temporada, v_p.rodada, 'carne', v_valor, 'Sócio-Torcedor (' || v_c.carne || ' sócios, já sem os 10% do fundo da liga)');
  end if;
  return v_valor;
end $$;
revoke execute on function public.pagar_socios(bigint, bigint) from public, anon, authenticated;

-- o botão antigo deixa de valer
create or replace function public.definir_carne(p_lugares int) returns int
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'O Sócio-Torcedor agora é automático: os sócios entram sozinhos na primeira rodada da temporada.';
end $$;

do $$
declare d text; antigo text;
begin
  -- lancar_rodada: remendos na versão no ar, sem copiar o corpo
  select pg_get_functiondef('public.lancar_rodada(bigint)'::regprocedure) into d;
  antigo := d;
  -- 115: patrocínio da escolha do clube
  if d not like '%patrocinio_semanal%' then
    d := replace(d, 'v_total := v_tv + v_pat - v_folha - v_manut;',
      'v_pat := coalesce(public.patrocinio_semanal(v_clube, v_l.temporada, v_l.rodadas_por_temporada), round(v_d.receita_patrocinio::numeric / v_l.rodadas_por_temporada));
      v_total := v_tv + v_pat - v_folha - v_manut;');
    d := replace(d, '''patrocinio'', v_pat, ''Patrocínio''', '''patrocinio'', v_pat, public.rotulo_patrocinio(v_clube, v_l.temporada)');
    if d not like '%rotulo_patrocinio%' then raise exception 'lancar_rodada: trecho do patrocínio não encontrado; nada foi trocado.'; end if;
  end if;
  -- 114: TV, patrocínio, salários e manutenção divididos pelas rodadas do grupo
  if d not like '%rodadas_do_grupo%' then
    d := replace(replace(d, 'coalesce(v_l.rodadas_por_temporada, 18)', 'public.rodadas_do_grupo(v_p.liga_id, v_p.grupo)'),
                 'v_l.rodadas_por_temporada', 'public.rodadas_do_grupo(v_p.liga_id, v_p.grupo)');
  end if;
  -- 122: operação do jogo
  if d not like '%custo_de_operacao%' then
    d := replace(d, 'v_comida int; v_gasto numeric;', 'v_comida int; v_gasto numeric; v_oper int; v_custo numeric;');
    d := replace(d, 'v_comida := round(v_publico * v_gasto / 1000.0);',
      'v_comida := round(v_publico * v_gasto / 1000.0);
  -- operação do jogo (segurança, staff e limpeza): por torcedor, pelo nível do estádio; na copa é dividida como a renda (122)
  v_custo := public.custo_de_operacao(v_c.estadio_nivel);
  v_oper := round(v_publico * v_custo / 1000.0);');
    d := replace(d, 'insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)',
      'v_parte := case when not v_copa then case when v_clube = v_p.casa then v_oper else 0 end
      when v_clube = v_p.casa then v_oper - v_oper / 2 else v_oper / 2 end;
    if v_parte > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, ''operacao'', -v_parte,
          ''Operação do jogo: segurança, staff e limpeza ('' || v_publico || '' torcedores, R$ '' || replace(to_char(v_custo, ''FM990.00''), ''.'', '','') || '' por cabeça'' || case when v_copa then '', metade para cada clube'' else '''' end || '')'');
      v_total := v_total - v_parte;
    end if;
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)');
    if d not like '%v_oper int%' or d not like '%v_custo := public.custo_de_operacao%' or d not like '%''operacao'', -v_parte%' then
      raise exception 'lancar_rodada: trecho da comida (118) não encontrado; nada foi trocado.'; end if;
  end if;
  -- 134: sócios automáticos
  if d not like '%garantir_socios%' then
    d := replace(d, 'v_carne := case when v_liga and v_c.carne_temporada',
      'if v_liga then perform public.garantir_socios(v_p.casa); perform public.garantir_socios(v_p.fora); select * into v_c from clubes where id = v_p.casa; end if;
  v_carne := case when v_liga and v_c.carne_temporada');
    d := replace(d, 'v_avulsos := v_publico - v_carne;', 'v_publico := greatest(v_publico, v_carne); -- público já definido no apito, antes dos sócios (134)
  v_avulsos := v_publico - v_carne;');
    d := replace(d, '''Salários dos jogadores'');', '''Salários dos jogadores'');
      v_total := v_total + public.pagar_socios(v_clube, p_partida);');
    if d not like '%perform public.garantir_socios(v_p.fora)%' or d not like '%v_publico := greatest(v_publico, v_carne)%' or d not like '%public.pagar_socios(v_clube, p_partida)%' then
      raise exception 'lancar_rodada: trecho do sócio-torcedor não encontrado; nada foi trocado.'; end if;
  end if;
  if d <> antigo then execute d; end if;

  -- definir_publico (público no apito): os sócios entram antes da conta
  select pg_get_functiondef('public.definir_publico(bigint)'::regprocedure) into d;
  if d not like '%garantir_socios%' then
    antigo := d;
    d := replace(d, 'v_carne := case when v_p.fase = ''liga'' and v_c.carne_temporada',
      'if v_p.fase = ''liga'' then perform public.garantir_socios(v_p.casa); select * into v_c from clubes where id = v_p.casa; end if;
    v_carne := case when v_p.fase = ''liga'' and v_c.carne_temporada');
    if d = antigo then raise exception 'definir_publico: trecho do sócio-torcedor não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;
end $$;

-- conferência: lancar_rodada com tudo true; definir_publico com socios true
select p.proname, pg_get_functiondef(p.oid) like '%garantir_socios%' as socios, pg_get_functiondef(p.oid) like '%patrocinio_semanal%' as patrocinio,
  pg_get_functiondef(p.oid) like '%custo_de_operacao%' as operacao, pg_get_functiondef(p.oid) like '%rodadas_do_grupo%' as rodadas
from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('lancar_rodada', 'definir_publico');
