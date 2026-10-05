-- Trem Soccer · fim da venda ao banco nos dois caminhos automáticos: o jogador vai para um clube sem dono, em vez de sumir.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 41_venda_pelo_agente.sql já executado. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Vale para: a venda forçada do clube que passa 3 rodadas seguidas abaixo do limite da dívida, e a oferta à liga que vence sem comprador.
-- Nos dois casos o clube recebe 3 vezes o salário de mercado do jogador (o preço do agente para clube no vermelho).

-- Vende um jogador pelo agente sem pedir nada ao dirigente. Uso interno. Devolve o valor recebido.
create or replace function public.venda_automatica(p_jogador bigint, p_descricao text) returns int
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype; v_l ligas%rowtype; v_mercado int; v_valor int; v_destino bigint; v_nome text;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.clube_id is null then return 0; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  select * into v_l from ligas where id = v_c.liga_id;
  v_mercado := coalesce(v_j.salario_mercado, v_j.salario, 0);
  v_valor := 3 * v_mercado;
  select c.id, c.nome into v_destino, v_nome from clubes c
    where c.liga_id = v_l.id and c.dono is null and vaga_no_elenco(c.id, v_j.idade) is null
    order by (c.divisao >= v_c.divisao) desc, (select count(*) from jogadores x where x.clube_id = c.id), random()
    limit 1;
  if v_destino is null then
    delete from jogadores where id = p_jogador; -- nenhum clube sem dono com vaga: o jogador encerra a carreira
  else
    update jogadores set clube_id = v_destino, salario = v_mercado, salario_mercado = v_mercado, contrato_ate = v_l.temporada + 2,
        protegido = false, protegido_ate = v_l.temporada, principal = false, treino = null, oferta_liga_ate = null
      where id = p_jogador;
    insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
      values (v_l.id, v_l.temporada, janela_do_mercado(v_l.id), 'agente_vermelho', v_j.id, v_j.nome, v_j.pos, v_c.id, v_destino, v_valor);
  end if;
  update financas set caixa = caixa + v_valor where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'venda', v_valor, p_descricao || v_j.nome || coalesce(' (' || v_nome || ')', ''));
  return v_valor;
end $$;
revoke execute on function public.venda_automatica(bigint, text) from public, anon, authenticated;

-- Sem escolha no prazo: o jogo vende pelo agente o maior salário fora dos 11 da tática salva (ou, sem tática, fora do grupo titular),
-- e repete até o caixa sair do negativo ou o elenco chegar a 16.
create or replace function public.venda_forcada(p_clube bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_caixa int; v_n int := 0;
begin
  loop
    select caixa into v_caixa from financas where clube_id = p_clube;
    exit when coalesce(v_caixa, 0) >= 0 or (select count(*) from jogadores where clube_id = p_clube) <= 16;
    select j.* into v_j from jogadores j where j.clube_id = p_clube and coalesce(j.salario, 0) > 0
      and case when exists (select 1 from taticas t where t.clube_id = p_clube and jsonb_typeof(t.dados->'jog') = 'array')
            then not exists (select 1 from taticas t, jsonb_array_elements_text(t.dados->'jog') x where t.clube_id = p_clube and x = 'j' || j.id)
            else not j.principal end
      order by j.salario desc, j.id limit 1;
    exit when v_j.id is null;
    exit when venda_automatica(v_j.id, 'Venda forçada pelo agente: ') <= 0; -- sem valor a receber, parar para não girar em falso
    v_n := v_n + 1;
  end loop;
  update clubes set vermelho_rodadas = 0 where id = p_clube;
  return v_n;
end $$;
revoke execute on function public.venda_forcada(bigint) from public, anon, authenticated;

-- leilões e ofertas à liga vencidas: a oferta sem comprador vai para o agente
create or replace function public.resolver_leiloes(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare j record; o record; n int := 0; v_temp int; v_horas numeric; v_sal int;
begin
  select temporada, horas_leilao into v_temp, v_horas from ligas where id = p_liga;
  for j in select x.id, x.livre_abriu, x.salario_mercado, x.idade from jogadores x where x.livre_liga = p_liga and x.clube_id is null and x.livre_ate is not null
            and (x.livre_ate <= now()
              -- acabou a entrada de clubes novos e só um deu lance: não há disputa, o leilão termina
              or (x.livre_inicio + make_interval(secs => (v_horas * 2700)::int) <= now()
                  and (select count(*) from ofertas_livres y where y.jogador_id = x.id) = 1)) loop
    for o in select * from ofertas_livres where jogador_id = j.id order by salario desc, criada_em, id loop
      if impedimento_de_contrato(o.clube_id, o.salario) is null and vaga_no_elenco(o.clube_id, j.idade) is null then
        v_sal := o.salario;
        if o.clube_id = j.livre_abriu then v_sal := greatest(coalesce(j.salario_mercado, 0), round(o.salario * 0.9)::int); end if; -- vantagem de quem abriu
        perform contratar_livre(j.id, o.clube_id, v_sal, o.temporadas);
        n := n + 1;
        exit;
      end if;
    end loop;
    -- se nenhum lance coube, o jogador segue livre, sem lances, à espera de um novo primeiro lance
    delete from ofertas_livres where jogador_id = j.id;
    update jogadores set livre_ate = null, livre_inicio = null, livre_abriu = null where id = j.id and clube_id is null;
  end loop;
  for j in select x.id, x.nome, x.salario, x.clube_id from jogadores x join clubes c on c.id = x.clube_id
            where c.liga_id = p_liga and x.oferta_liga_ate is not null and x.oferta_liga_ate <= now() loop
    if (select count(*) from jogadores where clube_id = j.clube_id) > 16 and coalesce((select caixa from financas where clube_id = j.clube_id), 0) < 0 then
      perform venda_automatica(j.id, 'Oferta à liga sem comprador, vendido pelo agente: ');
      n := n + 1;
    else
      update jogadores set oferta_liga_ate = null where id = j.id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.resolver_leiloes(bigint) from public, anon;
grant execute on function public.resolver_leiloes(bigint) to authenticated, service_role;
