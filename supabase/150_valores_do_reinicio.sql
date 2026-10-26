-- Trem Soccer · valores do reinício (calibragem aprovada em 25/10/2026: docs/superpowers/specs/2026-10-24-calibragem-do-reinicio.md).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 149 já executado. Depois: republicar as funções rodada e mercado e publicar o site.
--
-- O que muda:
--   1. teto de folha: Série A 19 mi, Série B 15 mi (divisoes.teto_folha); clubes dos outros países 19 mi (teto_do_clube). Mesmos números em
--      src/economia.js (TETO_DE_FOLHA) e src/virada.js (REGUA_DE_FORA.teto).
--   2. o agente paga com o fundo da liga, não mais com o caixa dos clubes sem dono (pagar_pelo_fundo). A cotação (0 a 1) é o saldo do fundo
--      sobre 2 mi por dirigente: com o fundo curto, o agente paga só o salário de mercado, e o fundo nunca fica negativo (o que faltar para
--      chegar ao mercado vem "de fora"). Vale para a venda pelo agente e para a venda automática (vermelho e oferta à liga sem comprador).
--   3. 6 vendas pelo agente por temporada (eram 4); a 5ª e a 6ª com o extra mais baixo, como a 5ª já era. Mesmo número em VENDAS_PELO_AGENTE.
--   4. clube sem dono recebe 50% da TV e do patrocínio na rodada (lancar_rodada).
--   5. imposto do caixa: no fechamento da temporada (virar_temporada, logo depois do imposto sobre o lucro), cada clube sem dono paga 30% do
--      caixa acima do seu teto de folha; vai para o fundo da liga, com linha própria na Federação (fundo_resumo, tipo imposto_do_caixa).

-- 1. tetos
update public.divisoes set teto_folha = 19000 where divisao = 1 and teto_folha is distinct from 19000;
update public.divisoes set teto_folha = 15000 where divisao = 2 and teto_folha is distinct from 15000;

create or replace function public.teto_do_clube(p_clube bigint) returns integer
language sql stable security definer set search_path = public as $$
  select case when c.pais <> 'Brasil' then 19000 else coalesce((select d.teto_folha from divisoes d
      where d.liga_id = c.liga_id and d.divisao = case when c.paraquedas = l.temporada then greatest(1, c.divisao - 1) else c.divisao end),
    l.teto_folha) end
  from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube
$$;

-- 2. o agente paga com o fundo: devolve o que o fundo pagou (até o saldo, nunca abaixo de zero)
create or replace function public.pagar_pelo_fundo(p_liga bigint, p_valor int) returns int
language plpgsql security definer set search_path = public as $$
declare v_pago int;
begin
  select least(greatest(0, coalesce(p_valor, 0)), greatest(0, coalesce(fundo_taca, 0))) into v_pago from ligas where id = p_liga for update;
  if coalesce(v_pago, 0) > 0 then
    perform set_config('trem.fundo', 'agente', true);
    update ligas set fundo_taca = fundo_taca - v_pago where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return coalesce(v_pago, 0);
end $$;
revoke execute on function public.pagar_pelo_fundo(bigint, int) from public, anon, authenticated;

create or replace function public.cotacao_do_agente(p_liga bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select least(1, greatest(0, coalesce(l.fundo_taca, 0)::numeric
    / greatest(1, (select count(*) from clubes where liga_id = p_liga and dono is not null)) / 2000.0))
  from ligas l where l.id = p_liga
$$;

-- imposto do caixa: devolve o total cobrado (vai todo para o fundo)
create or replace function public.cobrar_imposto_do_caixa(p_liga bigint, p_temporada int) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_total int := 0;
begin
  for r in select c.id, floor(0.3 * (f.caixa - teto_do_clube(c.id)))::int as valor
           from clubes c join financas f on f.clube_id = c.id
           where c.liga_id = p_liga and c.dono is null and c.grupo is distinct from 'X' and f.caixa > teto_do_clube(c.id) loop
    if r.valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.id, p_temporada, null, 'imposto', -r.valor, 'Imposto sobre o caixa parado (30% do que passa do teto de folha)');
      update financas set caixa = caixa - r.valor where clube_id = r.id;
      v_total := v_total + r.valor;
    end if;
  end loop;
  if v_total > 0 then
    perform set_config('trem.fundo', 'imposto_do_caixa', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) + v_total where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return v_total;
end $$;
revoke execute on function public.cobrar_imposto_do_caixa(bigint, int) from public, anon, authenticated;

-- 2 a 5: remendos na versão no ar, sem copiar o corpo (como no 134)
do $$
declare d text; antigo text;
begin
  -- vender_pelo_agente: 6 vendas e pagamento pelo fundo
  select pg_get_functiondef('public.vender_pelo_agente(bigint)'::regprocedure) into d;
  antigo := d;
  if d not like '%pagar_pelo_fundo%' then
    d := regexp_replace(d, 'pagar_pelos_bots\((v_l\.id, v_valor)[^\n]*\);[^\n]*', 'greatest(v_mercado, pagar_pelo_fundo(\1)); -- 150: pago pelo fundo da liga; com ele curto, o mercado');
    d := replace(replace(d, 'and janela is distinct from ''saida'') >= 4 then', 'and janela is distinct from ''saida'') >= 6 then'),
                 'Você já fez 4 vendas pelo agente nesta temporada.', 'Você já fez 6 vendas pelo agente nesta temporada.');
    if d not like '%pagar_pelo_fundo(v_l.id, v_valor)%' or d not like '%>= 6 then%' then
      raise exception 'vender_pelo_agente: trecho do pagamento ou do limite não encontrado; nada foi trocado.'; end if;
  end if;
  if d <> antigo then execute d; end if;

  -- venda_automatica (vermelho, oferta à liga sem comprador): pagamento pelo fundo
  select pg_get_functiondef('public.venda_automatica(bigint, text)'::regprocedure) into d;
  if d not like '%pagar_pelo_fundo%' then
    antigo := d;
    d := regexp_replace(d, 'pagar_pelos_bots\((v_l\.id, round\(v_mercado \* \(1 \+ 2 \* cotacao_do_agente\(v_l\.id\)\)\)::int), ''Compra pelo agente: '' \|\| v_j\.nome\);',
                        'greatest(v_mercado, pagar_pelo_fundo(\1)); -- 150: pago pelo fundo da liga');
    if d = antigo then raise exception 'venda_automatica: trecho do pagamento não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;

  -- lancar_rodada: clube sem dono com 50% da TV e do patrocínio
  select pg_get_functiondef('public.lancar_rodada(bigint)'::regprocedure) into d;
  if d not like '%v_rec numeric%' then
    antigo := d;
    d := replace(d, 'v_sede text; v_nome_sede text; v_pc numeric;', 'v_sede text; v_nome_sede text; v_pc numeric; v_rec numeric;');
    d := replace(d, 'v_total := v_tv + v_pat - v_folha - v_manut;',
      'v_rec := case when (select dono from clubes where id = v_clube) is null then 0.5 else 1 end; -- 150: clube sem dono recebe metade da TV e do patrocínio
      v_pat := round(v_pat * v_rec);
      v_total := round(v_tv * v_rec)::int + v_pat - v_folha - v_manut;');
    d := replace(d, '''tv'', v_tv, ''Cota de TV''', '''tv'', round(v_tv * v_rec)::int, ''Cota de TV''');
    if d not like '%v_rec numeric;%' or d not like '%round(v_tv * v_rec)::int + v_pat%' or d not like '%''tv'', round(v_tv * v_rec)::int%' then
      raise exception 'lancar_rodada: trecho da TV e do patrocínio não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;

  -- virar_temporada: imposto do caixa logo depois do imposto sobre o lucro
  select pg_get_functiondef('public.virar_temporada(bigint, jsonb)'::regprocedure) into d;
  if d not like '%cobrar_imposto_do_caixa%' then
    antigo := d;
    d := replace(d, '  -- 4. jogadores: quem fica, quem se aposenta, quem chega',
      '  -- 3b. imposto do caixa dos clubes sem dono, para o fundo da liga (150)
  perform public.cobrar_imposto_do_caixa(p_liga, v_l.temporada);

  -- 4. jogadores: quem fica, quem se aposenta, quem chega');
    if d = antigo then raise exception 'virar_temporada: trecho do passo 4 não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;
end $$;

drop function if exists public.pagar_pelos_bots(bigint, int, text);

-- conferência: tudo true
select p.proname,
  case p.proname when 'vender_pelo_agente' then pg_get_functiondef(p.oid) like '%pagar_pelo_fundo%' and pg_get_functiondef(p.oid) like '%>= 6 then%'
                 when 'venda_automatica' then pg_get_functiondef(p.oid) like '%pagar_pelo_fundo%'
                 when 'lancar_rodada' then pg_get_functiondef(p.oid) like '%v_rec numeric%'
                 when 'virar_temporada' then pg_get_functiondef(p.oid) like '%cobrar_imposto_do_caixa%' end as remendado
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('vender_pelo_agente', 'venda_automatica', 'lancar_rodada', 'virar_temporada');
