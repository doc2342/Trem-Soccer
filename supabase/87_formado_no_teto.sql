-- Trem Soccer · jogador formado no clube conta 85% do salário no teto de folha.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não exige republicar função.
-- Pode ser executado mais de uma vez. Precisa do 83_juvenil_no_elenco_minimo.sql.
--
-- O salário PAGO não muda: folha_do_clube continua sendo o dinheiro que sai por rodada. O que muda é a conta do teto, que passa a
-- usar folha_no_teto: nela, quem tem o próprio clube como formador pesa 85% (emprestado segue contando metade em cada clube).
-- ATENÇÃO para arquivos futuros: as funções que conferem o teto são trocadas aqui embaixo "no lugar" (bloco do), sem cópia do texto.
-- Quem recriar uma delas a partir de um arquivo antigo precisa escrever folha_no_teto no lugar de folha_do_clube.

create or replace function public.peso_no_teto(p_formador bigint, p_clube bigint) returns numeric
language sql immutable as $$ select case when p_formador = p_clube then 0.85 else 1 end $$;

create or replace function public.folha_no_teto(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(salario * case when emprestado_de is null then 1 else 0.5 end * peso_no_teto(formador, p_clube))), 0)::int
    from jogadores where clube_id = p_clube or emprestado_de = p_clube
$$;
grant execute on function public.folha_no_teto(bigint) to anon, authenticated;

-- a folha da virada (emprestados de volta pelo salário cheio) só serve para conferir o teto na renovação: mesmo desconto
create or replace function public.folha_na_virada(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(salario * peso_no_teto(formador, p_clube))), 0)::int from jogadores
    where (clube_id = p_clube and emprestado_de is null) or emprestado_de = p_clube
$$;

-- toda função que conferia o teto com folha_do_clube passa a usar folha_no_teto (empréstimo, lance por jogador livre, venda
-- negociada, compra pela multa); lancar_rodada fica de fora: ali é o salário pago
do $$
declare r record;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%folha_do_clube(%'
              and p.proname not in ('lancar_rodada', 'folha_do_clube', 'folha_no_teto') loop
    execute replace(pg_get_functiondef(r.oid), 'folha_do_clube(', 'folha_no_teto(');
    raise notice 'teto com desconto do formado: %', r.proname;
  end loop;
end $$;

-- ---------- renovação e aumento: o salário novo de um formado também entra com 85% ----------
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0, p_com_luvas boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int; v_caixa int; v_pede int; v_luvas int := 0; v_virada int; v_mais int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < 0 then raise exception 'Com o caixa negativo, aumentos e renovações ficam bloqueados.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  v_teto := teto_do_clube(v_c.id);
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if coalesce(p_com_luvas, false) then
    if p_temporadas = 0 then raise exception 'Luvas só na renovação do contrato.'; end if;
    v_pede := round(coalesce(v_j.salario_mercado, 0) * (1 + 0.1 * (p_temporadas - 1)));
    if p_salario >= v_pede then raise exception 'Com esse salário não há luvas a pagar: renove sem elas.'; end if;
    if p_salario < round(v_pede * 0.7) then raise exception 'Nem com luvas: o mínimo é % mil por temporada (70%% do pedido, % mil).', round(v_pede * 0.7), v_pede; end if;
    v_luvas := ceil((v_pede - p_salario) * 1.5 * p_temporadas);
    if coalesce(v_caixa, 0) < v_luvas then raise exception 'As luvas custam % mil e o caixa é de % mil.', v_luvas, coalesce(v_caixa, 0); end if;
  elsif p_temporadas > 0 and p_salario < v_j.salario_mercado then
    raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado;
  end if;
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  v_mais := round((p_salario - v_j.salario) * peso_no_teto(v_j.formador, v_c.id)); -- quanto o aumento pesa no teto
  v_folha := folha_no_teto(v_c.id);
  if v_folha + v_mais > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_mais, v_teto;
  end if;
  -- renovação: vale também a folha da virada, com os emprestados de volta pelo salário cheio
  v_virada := folha_na_virada(v_c.id);
  if p_temporadas > 0 and v_virada + v_mais > v_teto then
    raise exception 'Com a volta dos emprestados na virada, a folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_virada + v_mais, v_teto;
  end if;
  if v_luvas > 0 then
    perform set_config('trem.luvas', '1', true); -- o contrato progressivo não encurta: a diferença foi paga em luvas
    update financas set caixa = caixa - v_luvas where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_l.temporada, null, 'luvas', -v_luvas, 'Luvas: ' || v_j.nome || ' (' || p_temporadas || case when p_temporadas = 1 then ' temporada)' else ' temporadas)' end);
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
  if v_luvas > 0 then perform set_config('trem.luvas', '', true); end if;
end $$;

-- ---------- primeiro contrato do juvenil: igual ao do 83, com o salário dele pesando 85% se foi formado aqui ----------
create or replace function public.profissionalizar_jogador(p_user uuid, p_jogador bigint, p_mercado int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_j jogadores%rowtype; v_l ligas%rowtype; v_sal int; v_teto int; v_folha int; v_ate int; v_contratados int; v_pesa int;
begin
  select * into v_c from clubes where dono = p_user;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  select * into v_j from jogadores where id = p_jogador and clube_id = v_c.id for update;
  if v_j.id is null then raise exception 'Esse jogador não é do seu clube.'; end if;
  if not coalesce(v_j.juvenil, false) then raise exception '% já é profissional.', v_j.nome; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if coalesce(p_mercado, 0) <= 0 then raise exception 'Salário de mercado não informado.'; end if;
  select count(*) into v_contratados from jogadores where clube_id = v_c.id and not coalesce(juvenil, false);
  if v_contratados >= 30 then raise exception 'O elenco já tem 30 jogadores com contrato.'; end if;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) < 0 then raise exception 'Clube no vermelho: não dá para assinar contrato novo.'; end if;
  v_sal := round(p_mercado * (1 + 0.1 * (p_temporadas - 1)));
  v_teto := teto_do_clube(v_c.id);
  v_folha := folha_no_teto(v_c.id);
  v_pesa := round(v_sal * peso_no_teto(v_j.formador, v_c.id)); -- quanto o salário dele pesa no teto
  if v_folha + v_pesa > v_teto and v_contratados > 16 then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_pesa, v_teto; end if;
  v_ate := v_l.temporada + p_temporadas - case when rodadas_completas(v_l.id) < 9 then 1 else 0 end;
  update jogadores set juvenil = false, salario = v_sal, salario_mercado = p_mercado, contrato_ate = v_ate where id = p_jogador;
  return v_j.nome || ' assinou o primeiro contrato: ' || v_sal || ' mil por temporada, até o fim da temporada ' || v_ate || '.'
    || case when v_folha + v_pesa > v_teto then ' A folha ficou acima do teto (' || (v_folha + v_pesa) || ' de ' || v_teto || ' mil): enquanto não baixar, o clube não contrata nem renova.' else '' end;
end $$;
