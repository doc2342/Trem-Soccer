-- Trem Soccer · freio no topo sem cortar a bilheteria (18/10/2026, fase 1 da reestruturação econômica).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 118 (comida) e do 121 (economia da temporada). Não exige republicar função.
--
-- 1. Imposto em faixas sobre o lucro da temporada (o mesmo lucro de antes: prêmio dentro, mérito e prêmios individuais fora):
--    isento até 1/4 do teto de folha; 20% de 1/4 até 1/2 do teto; 35% de 1/2 até o teto; 50% acima do teto.
--    Na Série A (teto 20 mi): isento até 5 mi, 20% até 10 mi, 35% até 20 mi, 50% acima. Continua indo inteiro para o fundo da liga.
-- 2. Operação do jogo (segurança, staff e limpeza): R$ 0,10 × nível do estádio² por torcedor, pago pelo mandante
--    (nível 4: R$ 1,60; 5: R$ 2,50; 8: R$ 6,40). Na copa e na Libertadores, dividida meio a meio como a renda. O dinheiro sai da liga.
-- Mesmos números em src/economia.js (impostoDoLucro, OPERACAO). lancar_rodada: remendo na versão no ar (ver abaixo), que também devolve os trechos do 114 e do 115 que o 118 apagou.

create or replace function public.imposto_do_lucro(p_lucro int, p_teto int) returns int language sql immutable as $$
  select round(0.20 * least(greatest(p_lucro - p_teto / 4.0, 0), p_teto / 4.0)
             + 0.35 * least(greatest(p_lucro - p_teto / 2.0, 0), p_teto / 2.0)
             + 0.50 * greatest(p_lucro - p_teto, 0))::int
$$;

create or replace function public.custo_de_operacao(p_nivel int) returns numeric language sql immutable as $$
  select round(0.10 * least(8, greatest(1, coalesce(p_nivel, 1))) ^ 2::numeric, 2)
$$;

-- lancar_rodada: remendo na versão no ar, sem copiar o corpo. O 118 recriou a função a partir do texto do 81 e com isso
-- perdeu os remendos do 114 (rodadas do grupo) e do 115 (patrocínio por escolha); aqui eles voltam, se faltarem.
do $$
declare d text; antigo text;
begin
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
  if d <> antigo then execute d; end if;
end $$;

-- quadro de economia do admin: a operação do jogo entra no resultado operacional
create or replace function public.economia_interna(p_liga bigint, p_temporada int)
returns table (grupo text, clubes int, dirigentes int, caixa_media int, caixa_min int, caixa_max int, folha_media int,
  operacional int, premio int, saldo int, no_vermelho int, vermelho_em_2 int, por_tipo jsonb)
language sql stable security definer set search_path = public as $$
  with c as (
    select c.id, coalesce(h.grupo, c.grupo) as grupo, c.dono is not null as dir, f.caixa,
      (select coalesce(sum(j.salario), 0) from jogadores j where j.clube_id = c.id) as folha
    from clubes c join financas f on f.clube_id = c.id
    left join historico h on h.liga_id = c.liga_id and h.temporada = p_temporada and h.clube_id = c.id
    where c.liga_id = p_liga),
  m as (select l.clube_id, l.tipo, sum(l.valor)::bigint as v from lancamentos l join c on c.id = l.clube_id where l.temporada = p_temporada group by 1, 2),
  s as (select c.*,
      coalesce((select sum(v) from m where m.clube_id = c.id), 0) as saldo,
      coalesce((select sum(v) from m where m.clube_id = c.id and m.tipo in ('tv', 'patrocinio', 'bilheteria', 'carne', 'comida', 'operacao', 'salarios', 'manutencao', 'treinadores')), 0) as oper,
      coalesce((select sum(v) from m where m.clube_id = c.id and m.tipo = 'premio'), 0) as premio
    from c),
  g as (select s.grupo, count(*)::int n, count(*) filter (where dir)::int d, avg(caixa)::int cm, min(caixa)::int cmin, max(caixa)::int cmax, avg(folha)::int fm,
      avg(oper)::int op, avg(premio)::int pr, avg(saldo)::int sd, count(*) filter (where caixa < 0)::int nv,
      count(*) filter (where caixa >= 0 and saldo < 0 and caixa < -2 * saldo)::int v2
    from s group by s.grupo)
  select g.grupo, g.n, g.d, g.cm, g.cmin, g.cmax, g.fm, g.op, g.pr, g.sd, g.nv, g.v2,
    (select jsonb_object_agg(x.tipo, round(x.tot::numeric / g.n)) from (select m.tipo, sum(m.v) tot from m join c on c.id = m.clube_id where c.grupo = g.grupo group by m.tipo) x)
  from g order by g.grupo;
$$;
revoke execute on function public.economia_interna(bigint, int) from public, anon, authenticated;
