-- Trem Soccer · 168: os clubes sem dirigente gastam até ficar com 10% do teto de folha no caixa (era 25%) (30/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 66, do 72 e do 113. Depois: republicar a função "rodada" (src/mercadobots.js, CONFIG_MERCADO_BOTS.reserva) e publicar o site.
--
-- Depois do reinício os bots têm uns 5.260 (Série A, teto 19.000) e 4.600 (outros países, teto 20.000) de caixa. Com a reserva de 25%,
-- os da Série A só podiam gastar uns 500 e os de fora, nada: a venda de jogador de dirigente para bot, o mercado entre bots e a
-- contratação de livres pelos bots estavam travados. Com 10%: Série A ~3.300, outros países ~2.600.
-- As três funções são as mesmas do 66, do 72 e do 113 (conferidas com o banco em 30/10), só com 0.10 no lugar de 0.25.
-- Os listados que os bots já olharam nesta janela voltam para a fila (olham de novo, já com a reserva nova).

create or replace function public.transferir_entre_bots(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_janela text; v_marca text; x record; v_j jogadores%rowtype; v_de clubes%rowtype; v_para clubes%rowtype;
  v_caixa int; v_folha int; v_teto int; v_adultos int; v_resta int; n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  v_janela := janela_do_mercado(p_liga);
  if v_janela is null then return 0; end if;
  v_marca := v_l.temporada || ':' || v_janela;
  if v_l.bots_mercado is not distinct from v_marca then return 0; end if; -- esta janela já teve a rodada de negócios
  update ligas set bots_mercado = v_marca where id = p_liga;
  for x in select * from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as t(jogador bigint, para bigint, valor int, salario int) loop
    begin
      select * into v_j from jogadores where id = x.jogador for update;
      select * into v_de from clubes where id = v_j.clube_id;
      select * into v_para from clubes where id = x.para;
      continue when v_j.id is null or v_de.id is null or v_para.id is null or v_de.id = v_para.id;
      continue when v_de.dono is not null or v_para.dono is not null or v_de.liga_id <> p_liga or v_para.liga_id <> p_liga;
      continue when v_j.aposenta_em is not null or v_j.salario is null or coalesce(x.valor, 0) <= 0 or coalesce(x.salario, 0) <= 0;
      continue when v_j.idade <= 21; -- jovem não é vendido entre bots
      continue when coalesce(v_de.divisao, 3) < coalesce(v_para.divisao, 3) or coalesce(v_de.divisao, 3) > coalesce(v_para.divisao, 3) + 1; -- o talento só sobe ou fica
      select caixa into v_caixa from financas where clube_id = v_para.id;
      continue when coalesce(v_caixa, 0) - x.valor < 0.10 * teto_do_clube(v_para.id);
      select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_para.id;
      v_teto := teto_do_clube(v_para.id);
      continue when v_folha + x.salario > v_teto or x.salario > 0.15 * v_teto;
      select count(*) into v_resta from jogadores where clube_id = v_de.id and coalesce(juvenil, false) = false;
      continue when v_resta <= 18;
      select count(*) into v_adultos from jogadores where clube_id = v_para.id and idade > 21 and coalesce(juvenil, false) = false;
      continue when v_j.idade > 21 and v_adultos >= 35;
      update financas set caixa = caixa - x.valor where clube_id = v_para.id;
      insert into financas (clube_id, caixa) values (v_de.id, 5000 + x.valor) on conflict (clube_id) do update set caixa = financas.caixa + x.valor;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_para.id, v_l.temporada, null, 'compra', -x.valor, 'Compra: ' || v_j.nome || ' (' || v_de.nome || ')'),
        (v_de.id, v_l.temporada, null, 'venda', x.valor, 'Venda: ' || v_j.nome || ' (' || v_para.nome || ')');
      update jogadores set clube_id = v_para.id, salario = x.salario, salario_mercado = greatest(coalesce(salario_mercado, 0), x.salario),
        contrato_ate = v_l.temporada + 2, protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada, a_venda = false
        where id = v_j.id;
      insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
        values (p_liga, v_l.temporada, v_janela, 'bot', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, x.valor);
      n := n + 1;
    exception when others then null; -- um negócio que esbarra numa regra (limite do elenco, gatilhos) é pulado
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.transferir_entre_bots(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.transferir_entre_bots(bigint, jsonb) to service_role;

create or replace function public.bot_compra_listado(p_jogador bigint, p_para bigint, p_valor int, p_salario int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype; v_de clubes%rowtype; v_para clubes%rowtype; v_l ligas%rowtype; v_janela text; v_teto int; v_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  select * into v_de from clubes where id = v_j.clube_id;
  select * into v_para from clubes where id = p_para;
  if v_j.id is null or v_de.dono is null or v_para.id is null or v_para.dono is not null or v_para.liga_id <> v_de.liga_id then raise exception 'Negócio inválido.'; end if;
  if not coalesce(v_j.a_venda, false) or v_j.preco_pedido is distinct from p_valor then raise exception 'O jogador saiu da lista ou mudou de preço.'; end if;
  select * into v_l from ligas where id = v_de.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null or coalesce(v_l.pausada, false) then raise exception 'O mercado está fechado.'; end if;
  if exists (select 1 from propostas where jogador_id = p_jogador and estado in ('pendente', 'contra')) then raise exception 'Há proposta de dirigente.'; end if;
  if exists (select 1 from transferencias where liga_id = v_l.id and temporada = v_l.temporada and janela = v_janela and tipo = 'negociada' and para_clube = p_para) then
    raise exception 'Esse clube já comprou da lista nesta janela.';
  end if;
  v_teto := teto_do_clube(p_para);
  if coalesce((select caixa from financas where clube_id = p_para), 0) - p_valor < 0.10 * v_teto then raise exception 'O caixa do comprador não comporta.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario, 0) or p_salario > 0.15 * v_teto then raise exception 'Salário fora dos limites.'; end if;
  insert into propostas (liga_id, temporada, jogador_id, comprador, vendedor, valor, salario, temporadas)
    values (v_l.id, v_l.temporada, p_jogador, p_para, v_de.id, p_valor, p_salario, 2) returning id into v_id;
  return fechar_negocio(v_id, p_valor);
end $$;
revoke execute on function public.bot_compra_listado(bigint, bigint, int, int) from public, anon, authenticated;
grant execute on function public.bot_compra_listado(bigint, bigint, int, int) to service_role;

create or replace function public.bot_contrata_livre(p_jogador bigint, p_para bigint, p_salario int) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_para clubes%rowtype; v_l ligas%rowtype; v_janela text; v_motivo text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  select * into v_para from clubes where id = p_para;
  if v_j.id is null or v_para.id is null or not clube_do_bot(p_para) or v_j.clube_id is not null or v_j.livre_liga is distinct from v_para.liga_id then
    raise exception 'Contratação inválida.';
  end if;
  if v_j.livre_ate is not null or exists (select 1 from ofertas_livres where jogador_id = p_jogador) then raise exception 'Há leilão de dirigente.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null or coalesce(v_l.pausada, false) then raise exception 'O mercado está fechado.'; end if;
  if exists (select 1 from transferencias where liga_id = v_l.id and temporada = v_l.temporada and janela = v_janela and tipo = 'livre' and para_clube = p_para) then
    raise exception 'Esse clube já contratou um livre nesta janela.';
  end if;
  if (select count(*) from transferencias t
       where t.liga_id = v_l.id and t.temporada = v_l.temporada and t.janela = v_janela and t.tipo = 'livre' and clube_do_bot(t.para_clube)) >= 8 then
    raise exception 'Os bots já contrataram 8 livres nesta janela.';
  end if;
  if coalesce((select caixa from financas where clube_id = p_para), 0) < 0.10 * teto_do_clube(p_para) then raise exception 'O caixa do bot não comporta.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario_mercado, 0) then raise exception 'Salário abaixo do de mercado.'; end if;
  v_motivo := coalesce(impedimento_de_contrato(p_para, p_salario), vaga_no_elenco(p_para, v_j.idade), vaga_de_estrangeiro(p_para, p_jogador));
  if v_motivo is not null then raise exception 'Não dá: %.', v_motivo; end if;
  perform contratar_livre(p_jogador, p_para, p_salario, 1);
  return 'ok';
end $$;
revoke execute on function public.bot_contrata_livre(bigint, bigint, int) from public, anon, authenticated;
grant execute on function public.bot_contrata_livre(bigint, bigint, int) to service_role;

-- os listados que os bots já olharam nesta janela (com a reserva antiga) voltam para a fila
update public.jogadores set bots_viram = null where a_venda and bots_viram is not null;
