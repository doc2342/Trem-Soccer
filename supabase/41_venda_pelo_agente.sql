-- Trem Soccer · venda pelo agente (no lugar da venda ao banco) e lista de protegidos com 7 jogadores.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 38_janela_de_fim_de_temporada.sql já executado. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Venda pelo agente: saída garantida para um jogador que ninguém comprou. O agente o coloca num clube sem dono.
--   preço: 2,5 vezes o SALÁRIO DE MERCADO do jogador (metade do valor de mercado). O salário de mercado é calculado pelo jogo,
--          pela nota e pela idade; aumentar o salário do contrato não aumenta o preço.
--   quando: só com a janela aberta, até 4 vendas por temporada.
--   clube no vermelho (caixa negativo): paga 3 vezes o salário de mercado, vale com a janela fechada e não conta no limite.
--   destino: o clube sem dono, da mesma divisão ou de uma inferior, com o menor elenco; lá ele assina por 2 temporadas pelo salário de mercado.
-- O jogador não some do jogo, como acontecia na venda ao banco: pode ser comprado de volta pela multa.

create or replace function public.vender_pelo_agente(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype; v_c clubes%rowtype; v_l ligas%rowtype;
  v_caixa int; v_vermelho boolean; v_janela text; v_mercado int; v_valor int; v_destino bigint; v_nome text;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if exists (select 1 from partidas p where (p.casa = v_c.id or p.fora = v_c.id) and p.processada and p.fim > now()) then
    raise exception 'Há uma partida do seu clube em andamento. Venda depois do apito final.';
  end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  v_vermelho := coalesce(v_caixa, 0) < 0;
  v_janela := janela_do_mercado(v_l.id);
  if not v_vermelho then
    if v_janela is null then raise exception 'O agente só vende com a janela de transferências aberta.'; end if;
    if (select count(*) from transferencias where liga_id = v_l.id and temporada = v_l.temporada and de_clube = v_c.id and tipo = 'agente') >= 4 then
      raise exception 'Você já fez 4 vendas pelo agente nesta temporada.';
    end if;
  end if;
  v_mercado := coalesce(v_j.salario_mercado, v_j.salario);
  if v_mercado is null then raise exception 'Esse jogador não tem valor de mercado definido.'; end if;
  v_valor := round(v_mercado * case when v_vermelho then 3 else 2.5 end);

  -- destino: clube sem dono com vaga, da mesma divisão ou abaixo, o de menor elenco (sem nenhum, qualquer clube sem dono com vaga)
  select c.id, c.nome into v_destino, v_nome from clubes c
    where c.liga_id = v_l.id and c.dono is null and vaga_no_elenco(c.id, v_j.idade) is null
    order by (c.divisao >= v_c.divisao) desc, (select count(*) from jogadores x where x.clube_id = c.id), random()
    limit 1;
  if v_destino is null then raise exception 'O agente não achou clube com vaga para esse jogador.'; end if;

  update jogadores set clube_id = v_destino, salario = v_mercado, salario_mercado = v_mercado, contrato_ate = v_l.temporada + 2,
      protegido = false, protegido_ate = v_l.temporada, principal = false, treino = null
    where id = p_jogador;
  update financas set caixa = caixa + v_valor where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'venda', v_valor, 'Venda pelo agente: ' || v_j.nome || ' (' || v_nome || ')');
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, v_janela, case when v_vermelho then 'agente_vermelho' else 'agente' end, v_j.id, v_j.nome, v_j.pos, v_c.id, v_destino, v_valor);
  return v_j.nome || ' vendido pelo agente ao ' || v_nome || ' por ' || v_valor || ' mil.';
end $$;
revoke execute on function public.vender_pelo_agente(bigint) from public, anon;
grant execute on function public.vender_pelo_agente(bigint) to authenticated;

-- a venda ao banco deixa de existir
create or replace function public.vender_ao_banco(p_jogador bigint) returns int
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'A venda ao banco foi substituída pela venda pelo agente.';
end $$;

-- Lista de protegidos: agora até 7 jogadores por clube ficam sem multa rescisória.
create or replace function public.proteger_jogador(p_jogador bigint, p_proteger boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if p_proteger then
    if v_j.protegido then return; end if;
    if (select count(*) from jogadores where clube_id = v_c.id and protegido) >= 7 then raise exception 'A lista de protegidos já tem 7 jogadores.'; end if;
  else
    if janela_do_mercado(v_c.liga_id) is not null then raise exception 'Com a janela aberta, ninguém sai da lista de protegidos.'; end if;
  end if;
  update jogadores set protegido = p_proteger where id = p_jogador;
end $$;
revoke execute on function public.proteger_jogador(bigint, boolean) from public, anon;
grant execute on function public.proteger_jogador(bigint, boolean) to authenticated;
