-- Trem Soccer · pacote da economia (decisões de 5 de outubro de 2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 51_escudo_enviado.sql já executado. Depois, republicar a função "rodada" (o treino usa o teto novo). Pode ser executado mais de uma vez.
--
-- 1. Contrato mais longo pede mais: 2 temporadas, salário de mercado + 10%; 3 temporadas, + 20%. Vale em renovação, multa, proposta,
--    leilão de livres, oferta da liga e pré-contrato. As telas já pedem o valor certo; se chegar um contrato com salário abaixo do que a
--    duração pede, o contrato é encurtado para a duração que aquele salário paga (nunca dá erro, para não travar os caminhos automáticos).
-- 2. Agente: quem paga a venda são os clubes sem dono (o caixa deles, somado). Com o caixa folgado o preço é o cheio (2,5 vezes o salário
--    de mercado; 3 vezes no vermelho); quando aperta, cai até 1 vez. A venda nunca falha por falta de dinheiro: rende menos.
-- 3. 10% da bilheteria de todo jogo vão para o fundo da liga, que paga a copa. O prêmio de cada fase só sai se o fundo tiver saldo.
-- 4. (Na página do administrador, sem SQL: clube sem dono respeita o teto de folha ao renovar.)
-- 5. Quem assume um clube sem dono começa com o caixa padrão de 5 mi, não com o que o bot juntou ou devia.
-- 6. Teto dos jogadores: 23 + 0,20 × talento (era 24 + 0,22), para a liga madura ficar em 38 / 35 / 32 nos titulares de A / B / C.

-- ---------- 1. contrato progressivo ----------
create or replace function public.salario_progressivo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_t int; v_n int;
begin
  if coalesce(current_setting('trem.virada', true), '') = '1' then return new; end if;
  if new.clube_id is null or new.salario is null or new.contrato_ate is null or coalesce(new.salario_mercado, 0) <= 0 then return new; end if;
  if new.contrato_ate is not distinct from old.contrato_ate and new.clube_id is not distinct from old.clube_id then return new; end if;
  if old.contrato_ate is null and old.clube_id is not distinct from new.clube_id then return new; end if; -- primeiro contrato dado pelo administrador
  select l.temporada into v_t from clubes c join ligas l on l.id = c.liga_id where c.id = new.clube_id;
  if v_t is null then return new; end if;
  v_n := new.contrato_ate - v_t;
  if v_n <= 1 then return new; end if;
  while v_n > 1 and new.salario < round(new.salario_mercado * (1 + 0.1 * (v_n - 1))) loop v_n := v_n - 1; end loop;
  new.contrato_ate := v_t + v_n;
  return new;
end $$;
drop trigger if exists salario_progressivo on public.jogadores;
create trigger salario_progressivo before update on public.jogadores for each row execute function public.salario_progressivo();

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
        if o.clube_id = j.livre_abriu then v_sal := greatest(round(coalesce(j.salario_mercado, 0) * (1 + 0.1 * (o.temporadas - 1)))::int, round(o.salario * 0.9)::int); end if; -- vantagem de quem abriu
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

-- ---------- 2. agente pago pelos clubes sem dono ----------
-- De 0 a 1: quanto do preço cheio o agente consegue pagar. Soma o caixa positivo dos clubes sem dono, divide pelos dirigentes da liga
-- e compara com 6 mi por dirigente (quatro vendas de um bom jogador).
create or replace function public.cotacao_do_agente(p_liga bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select least(1, greatest(0,
    (select coalesce(sum(greatest(f.caixa, 0)), 0) from financas f join clubes c on c.id = f.clube_id where c.liga_id = p_liga and c.dono is null)::numeric
    / greatest(1, (select count(*) from clubes where liga_id = p_liga and dono is not null)) / 6000.0))
$$;
revoke execute on function public.cotacao_do_agente(bigint) from public, anon;
grant execute on function public.cotacao_do_agente(bigint) to authenticated, service_role;

-- Tira o valor do caixa dos clubes sem dono, começando pelos mais ricos. Devolve quanto conseguiu pagar. Uso interno.
create or replace function public.pagar_pelos_bots(p_liga bigint, p_valor int, p_descricao text) returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_falta int := greatest(0, coalesce(p_valor, 0)); v_parte int; v_t int;
begin
  select temporada into v_t from ligas where id = p_liga;
  for r in select f.clube_id, f.caixa from financas f join clubes c on c.id = f.clube_id
           where c.liga_id = p_liga and c.dono is null and f.caixa > 0 order by f.caixa desc for update of f loop
    exit when v_falta <= 0;
    v_parte := least(r.caixa, v_falta);
    update financas set caixa = caixa - v_parte where clube_id = r.clube_id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'compra', -v_parte, p_descricao);
    v_falta := v_falta - v_parte;
  end loop;
  return greatest(0, coalesce(p_valor, 0)) - v_falta;
end $$;
revoke execute on function public.pagar_pelos_bots(bigint, int, text) from public, anon, authenticated;

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
  v_valor := round(v_mercado * (1 + (case when v_vermelho then 2 else 1.5 end) * cotacao_do_agente(v_l.id)));

  -- destino: clube sem dono com vaga, da mesma divisão ou abaixo, o de menor elenco (sem nenhum, qualquer clube sem dono com vaga)
  select c.id, c.nome into v_destino, v_nome from clubes c
    where c.liga_id = v_l.id and c.dono is null and vaga_no_elenco(c.id, v_j.idade) is null
    order by (c.divisao >= v_c.divisao) desc, (select count(*) from jogadores x where x.clube_id = c.id), random()
    limit 1;
  if v_destino is null then raise exception 'O agente não achou clube com vaga para esse jogador.'; end if;
  v_valor := pagar_pelos_bots(v_l.id, v_valor, 'Compra pelo agente: ' || v_j.nome); -- quem paga são os clubes sem dono; sem caixa neles, o valor encolhe

  update jogadores set clube_id = v_destino, salario = v_mercado, salario_mercado = v_mercado, contrato_ate = v_l.temporada + 1,
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

create or replace function public.venda_automatica(p_jogador bigint, p_descricao text) returns int
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype; v_l ligas%rowtype; v_mercado int; v_valor int; v_destino bigint; v_nome text;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.clube_id is null then return 0; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  select * into v_l from ligas where id = v_c.liga_id;
  v_mercado := coalesce(v_j.salario_mercado, v_j.salario, 0);
  v_valor := pagar_pelos_bots(v_l.id, round(v_mercado * (1 + 2 * cotacao_do_agente(v_l.id)))::int, 'Compra pelo agente: ' || v_j.nome);
  select c.id, c.nome into v_destino, v_nome from clubes c
    where c.liga_id = v_l.id and c.dono is null and vaga_no_elenco(c.id, v_j.idade) is null
    order by (c.divisao >= v_c.divisao) desc, (select count(*) from jogadores x where x.clube_id = c.id), random()
    limit 1;
  if v_destino is null then
    delete from jogadores where id = p_jogador; -- nenhum clube sem dono com vaga: o jogador encerra a carreira
  else
    update jogadores set clube_id = v_destino, salario = v_mercado, salario_mercado = v_mercado, contrato_ate = v_l.temporada + 1,
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

-- ---------- 3. taxa da bilheteria para o fundo e prêmio da copa com saldo ----------
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
  v_publico int; v_bilheteria int; v_lugares int; v_carne int; v_avulsos int;
  v_saldo int; v_dh numeric; v_dt numeric;
  v_liga boolean; v_caixa int; v_n int;
  v_copa boolean; v_vencedor bigint; v_parte int; v_taxa int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  v_copa := v_p.fase = 'copa';
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

  -- público: o sócio-torcedor já pagou e ocupa o lugar; os demais compram ingresso se houver lugar
  v_lugares := 5000 + 5000 * v_c.estadio_nivel;
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  -- se o público já foi definido no início da partida (definir_publico), vale ele
  v_publico := coalesce(v_p.publico, least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)))));
  v_avulsos := v_publico - v_carne;
  v_bilheteria := round(v_avulsos * v_d.preco_ingresso / 1000.0);
  -- 10% da bilheteria de todo jogo vão para o fundo da liga, que paga os prêmios da copa
  v_taxa := round(v_bilheteria * 0.10);
  v_bilheteria := v_bilheteria - v_taxa;
  if v_taxa > 0 then update ligas set fundo_taca = coalesce(fundo_taca, 0) + v_taxa where id = v_p.liga_id; end if;
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
      select round(greatest(0, (select receita_tv from divisoes where liga_id = v_p.liga_id and divisao = c.divisao - 1) - v_d.receita_tv)::numeric / 2 / v_l.rodadas_por_temporada)
        into v_extra from clubes c where c.id = v_clube and c.paraquedas = v_l.temporada;
      if coalesce(v_extra, 0) > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'paraquedas', v_extra, 'Paraquedas de TV');
        v_total := v_total + v_extra;
      end if;
    end if;
    if v_copa then
      -- copa: a renda do jogo é dividida meio a meio (o centavo que sobra fica com o dono do estádio)
      v_parte := case when v_clube = v_p.casa then v_bilheteria - v_bilheteria / 2 else v_bilheteria / 2 end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_parte,
          'Bilheteria da copa, metade de ' || v_bilheteria || ' mil, já sem os 10% do fundo da liga (' || v_publico || ' pagantes' || case when v_clube = v_p.casa then ', no seu estádio' else ', no estádio do adversário' end || ')');
      v_total := v_total + v_parte;
    elsif v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria,
          'Bilheteria (' || v_avulsos || ' pagantes' || case when v_carne > 0 then ' e ' || v_carne || ' sócios-torcedores' else '' end || ', já sem os 10% do fundo da liga)' || case when v_liga then '' else ' · playoff' end);
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

      -- clube no vermelho: abaixo de 10% do teto no negativo, o prazo corre; na terceira rodada seguida, o jogo vende ao banco
      select caixa into v_caixa from financas where clube_id = v_clube;
      if v_caixa < -0.10 * teto_do_clube(v_clube) then
        update clubes set vermelho_rodadas = vermelho_rodadas + 1 where id = v_clube returning vermelho_rodadas into v_n;
        if v_n >= 3 then perform venda_forcada(v_clube); end if;
      else
        update clubes set vermelho_rodadas = 0 where id = v_clube and vermelho_rodadas <> 0;
      end if;
    end if;

    if v_r.partida_id is not null then
      v_saldo := case when v_clube = v_p.casa then v_r.gols_casa - v_r.gols_fora else v_r.gols_fora - v_r.gols_casa end;
      if v_copa then
        -- campo neutro: sem peso de mando; nos pênaltis, quem passa fica um pouco feliz e quem cai, um pouco triste
        v_vencedor := coalesce(v_p.vencedor, nullif(v_r.relatorio->>'vencedor', '')::bigint);
        if v_saldo = 0 and v_vencedor is not null then
          if v_vencedor = v_clube then v_dh := 0.5; v_dt := 0.005; else v_dh := -0.5; v_dt := -0.005; end if;
        elsif v_saldo > 0 then v_dh := 1; v_dt := 0.01;
        elsif v_saldo = 0 then v_dh := 0; v_dt := 0;
        else v_dh := -0.8; v_dt := -0.01;
        end if;
      elsif v_saldo > 0 then v_dh := 1; v_dt := 0.01;
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

create or replace function public.copa_premiar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_pagas jsonb; v_fase int; v_valor int; v_total int := 0; v_n int;
  v_final partidas%rowtype; v_campeao bigint; v_vice bigint;
  c_valores int[] := array[0, 50, 150, 300, 500]; -- ao entrar na fase 1 a 5 (preliminar, 32, oitavas, quartas, semifinal)
  c_nomes text[] := array['preliminar', 'fase de 32', 'oitavas', 'quartas', 'semifinal'];
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.copa is null then return 0; end if;
  v_pagas := coalesce(v_l.copa->'pagas', '[]'::jsonb);
  for v_fase in 2..5 loop
    if v_pagas @> to_jsonb(v_fase) then continue; end if;
    if not exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) then continue; end if;
    v_valor := c_valores[v_fase];
    -- o fundo precisa ter saldo para a fase inteira; sem saldo, o prêmio fica pendente e sai quando o fundo encher
    if coalesce(v_l.fundo_taca, 0) - v_total < v_valor * (select count(*) from (select casa as clube from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
        union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) x) then continue; end if;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select x.clube, v_l.temporada, 100 + v_fase, 'copa', v_valor, 'Copa do Brasil: prêmio por chegar ' || case when v_fase = 2 then 'à ' else 'às ' end || c_nomes[v_fase]
        from (select casa as clube from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
              union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) x;
    get diagnostics v_n = row_count;
    update financas f set caixa = f.caixa + v_valor
      where f.clube_id in (select casa from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
                           union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase);
    v_total := v_total + v_valor * v_n;
    v_pagas := v_pagas || to_jsonb(v_fase);
  end loop;
  -- final: paga depois do apito final (resultado liberado e efeitos gravados, com o vencedor anotado)
  if not v_pagas @> to_jsonb(6) then
    select * into v_final from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = 6 order by id limit 1;
    if v_final.id is not null and v_final.processada and v_final.fim <= now()
       and exists (select 1 from resultados r where r.partida_id = v_final.id and r.efeitos is null) then
      select coalesce(v_final.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint,
                      case when r.gols_fora > r.gols_casa then v_final.fora else v_final.casa end)
        into v_campeao from resultados r where r.partida_id = v_final.id;
      v_vice := case when v_campeao = v_final.casa then v_final.fora else v_final.casa end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_campeao, v_l.temporada, 106, 'copa', 2000, 'Copa do Brasil: prêmio de campeão'),
        (v_vice, v_l.temporada, 106, 'copa', 800, 'Copa do Brasil: prêmio de vice-campeão');
      update financas set caixa = caixa + 2000 where clube_id = v_campeao;
      update financas set caixa = caixa + 800 where clube_id = v_vice;
      v_total := v_total + 2800;
      v_pagas := v_pagas || to_jsonb(6);
      v_l.copa := jsonb_set(v_l.copa, '{campeao}', to_jsonb(v_campeao));
    end if;
  end if;
  if v_total > 0 then
    update ligas set fundo_taca = fundo_taca - v_total, copa = jsonb_set(v_l.copa, '{pagas}', v_pagas) where id = p_liga;
  end if;
  return v_total;
end $$;
revoke execute on function public.copa_premiar(bigint) from public, anon, authenticated;
grant execute on function public.copa_premiar(bigint) to service_role;

-- ---------- 5. caixa padrão para quem assume um clube sem dono ----------
create or replace function public.caixa_de_quem_assume() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.dono is null and new.dono is not null then
    insert into financas (clube_id, caixa) values (new.id, 5000) on conflict (clube_id) do update set caixa = 5000;
    update clubes set vermelho_rodadas = 0 where id = new.id and vermelho_rodadas <> 0;
  end if;
  return null;
end $$;
drop trigger if exists clubes_caixa_de_quem_assume on public.clubes;
create trigger clubes_caixa_de_quem_assume after update of dono on public.clubes for each row execute function public.caixa_de_quem_assume();

-- ---------- 6. teto dos jogadores ----------
create or replace function public.teto_em_faixa(p_jogador bigint, p_largura numeric, p_chave text) returns int[]
language plpgsql stable security definer set search_path = public as $$
declare v_tal int; v_teto numeric; v_u numeric; v_min numeric;
begin
  select tal into v_tal from jogadores_ocultos where jogador_id = p_jogador;
  v_teto := 23 + 0.20 * coalesce(v_tal, 50);
  v_u := (('x' || substr(md5(p_jogador::text || ':' || p_chave), 1, 6))::bit(24)::int) / 16777216.0; -- de 0 a 1, fixo para cada jogador e chave
  v_min := v_teto - p_largura * v_u;
  return array[floor(v_min)::int, least(50, ceil(v_min + p_largura)::int)];
end $$;
revoke execute on function public.teto_em_faixa(bigint, numeric, text) from public, anon, authenticated;
