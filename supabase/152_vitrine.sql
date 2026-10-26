-- Trem Soccer · vitrine do agente: o jogador vendido ao agente vai a leilão entre os dirigentes (desenho aprovado em 25/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 150 já executado. Depois: publicar o site (aba "Vitrine" no Mercado).
--
-- Como funciona:
--   1. a vitrine é um clube sem dono no grupo X (como o guardado), apontado por ligas.vitrine; nasce na primeira venda pelo agente.
--      Tudo o que já ignora o grupo X a deixa fora de liga, copa, base e mercado dos bots.
--   2. vender_pelo_agente manda o jogador para a vitrine (e não mais para um bot), com vitrine_minimo = o maior entre o que o agente pagou
--      e 3× o salário de mercado (o piso de uma venda combinada entre donos). venda_automatica (vermelho, oferta à liga) continua indo a bot.
--   3. dar_lance_vitrine: só dono, só com a janela aberta, nunca quem vendeu (nem por outro clube dele). O lance tem valor (≥ mínimo, vai
--      para o fundo) e contrato como nos livres (salário ≥ mercado, 1 a 3 temporadas, cabendo no teto com os outros leilões em que o clube
--      está na frente). Vence o maior valor; no empate, o maior salário. O primeiro lance abre o prazo (fim_do_leilao); lance nos últimos
--      3 minutos estende 3 minutos.
--   4. resolver_vitrine (chamada pelo resolver_leiloes, que o agendamento roda a cada minuto): só com a janela aberta; fora dela o leilão
--      espera a próxima. O valor sai do caixa do comprador e vai para o fundo (fundo_resumo tipo 'vitrine').
--   5. virada: quem está na vitrine sem lance sai do jogo (exterior fictício; não vai para os países).

alter table public.ligas add column if not exists vitrine bigint references public.clubes(id) on delete set null;
alter table public.jogadores add column if not exists vitrine_minimo int;
alter table public.jogadores add column if not exists vitrine_dono uuid;
alter table public.ofertas_livres add column if not exists valor int; -- só nos lances da vitrine; nos livres fica vazio

-- a vitrine da liga (cria na primeira vez)
create or replace function public.vitrine_da_liga(p_liga bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  select vitrine into v from ligas where id = p_liga for update;
  if v is null or not exists (select 1 from clubes where id = v) then
    insert into clubes (liga_id, grupo, divisao, nome, sigla, pais) values (p_liga, 'X', 2, 'Vitrine do agente', 'VIT', 'Brasil') returning id into v;
    update ligas set vitrine = v where id = p_liga;
  end if;
  return v;
end $$;
revoke execute on function public.vitrine_da_liga(bigint) from public, anon, authenticated;

-- a vitrine não tem limite de elenco nem de estrangeiros (as duas iguais às do ar, com a exceção)
create or replace function public.vaga_no_elenco(p_clube bigint, p_idade integer) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from ligas where vitrine = p_clube) then null
    when (select count(*) from jogadores where (clube_id = p_clube or emprestado_de = p_clube) and not coalesce(juvenil, false)) >= 30 then 'o elenco já tem 30 jogadores com contrato'
    else null end
$$;
create or replace function public.vaga_de_estrangeiro(p_clube bigint, p_jogador bigint) returns text
language sql stable security definer set search_path = public as $$
  select case when j.pais <> c.pais and not exists (select 1 from ligas where vitrine = c.id) and (select count(*) from jogadores x
      where (x.clube_id = c.id or x.emprestado_de = c.id) and x.pais <> c.pais and x.id <> j.id) >= 5
    then 'o clube já tem 5 estrangeiros' end
  from jogadores j, clubes c where j.id = p_jogador and c.id = p_clube
$$;

-- o guardado continua congelado; a vitrine só recebe e entrega pelas funções deste arquivo (trem.vitrine), nunca pela multa ou proposta
create or replace function public.guardado_congelado() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.clube_id is distinct from old.clube_id
     and exists (select 1 from clubes where id in (old.clube_id, new.clube_id) and grupo = 'X')
     and not (coalesce(current_setting('trem.vitrine', true), '') = '1' and exists (select 1 from ligas where vitrine in (old.clube_id, new.clube_id))) then
    raise exception 'Clube guardado: fora do mercado até voltar a uma competição.';
  end if;
  return new;
end $$;

-- salário que o clube já tem prometido nos leilões abertos (livres e vitrine) em que está na frente, fora o deste jogador.
-- Na frente: maior valor (vitrine; nos livres é zero), depois maior salário, depois o lance mais antigo.
create or replace function public.folha_prometida(p_clube bigint, p_exceto bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(o.salario), 0)::int from ofertas_livres o join jogadores x on x.id = o.jogador_id
   where o.clube_id = p_clube and o.jogador_id is distinct from p_exceto
     and (x.clube_id is null or x.clube_id in (select vitrine from ligas where vitrine is not null))
     and not exists (select 1 from ofertas_livres y where y.jogador_id = o.jogador_id and y.clube_id <> o.clube_id
                      and (coalesce(y.valor, 0), y.salario, o.criada_em, o.id) > (coalesce(o.valor, 0), o.salario, y.criada_em, y.id))
$$;
revoke execute on function public.folha_prometida(bigint, bigint) from public, anon;
grant execute on function public.folha_prometida(bigint, bigint) to authenticated, service_role;

create or replace function public.resolver_vitrine(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_janela text; j record; o record; n int := 0; v_motivo text;
begin
  select * into v_l from ligas where id = p_liga;
  v_janela := janela_do_mercado(p_liga);
  if v_l.vitrine is null or v_janela is null then return 0; end if; -- janela fechada: o leilão espera a próxima
  for j in select x.id, x.nome, x.pos, x.idade from jogadores x where x.clube_id = v_l.vitrine and x.livre_ate is not null and x.livre_ate <= now() loop
    for o in select f.* from ofertas_livres f join clubes c on c.id = f.clube_id
              where f.jogador_id = j.id and c.dono is not null order by f.valor desc nulls last, f.salario desc, f.criada_em, f.id loop
      v_motivo := coalesce(impedimento_de_contrato(o.clube_id, o.salario), vaga_no_elenco(o.clube_id, j.idade), vaga_de_estrangeiro(o.clube_id, j.id),
        case when coalesce((select caixa from financas where clube_id = o.clube_id), 0) < o.valor then 'o caixa não cobre o valor' end);
      if v_motivo is null then
        perform set_config('trem.vitrine', '1', true);
        update jogadores set clube_id = o.clube_id, salario = o.salario, contrato_ate = v_l.temporada + o.temporadas, protegido = false, protegido_ate = v_l.temporada,
            principal = false, treino = null, chegou_temporada = v_l.temporada, chegou_janela = v_janela,
            livre_ate = null, livre_inicio = null, vitrine_minimo = null, vitrine_dono = null
          where id = j.id;
        perform set_config('trem.vitrine', '', true);
        update financas set caixa = caixa - o.valor where clube_id = o.clube_id;
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (o.clube_id, v_l.temporada, null, 'compra', -o.valor, 'Compra na vitrine do agente: ' || j.nome);
        perform set_config('trem.fundo', 'vitrine', true);
        update ligas set fundo_taca = coalesce(fundo_taca, 0) + o.valor where id = p_liga;
        perform set_config('trem.fundo', '', true);
        insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
          values (p_liga, v_l.temporada, v_janela, 'vitrine', j.id, j.nome, j.pos, v_l.vitrine, o.clube_id, o.valor);
        n := n + 1;
        exit;
      end if;
    end loop;
    -- nenhum lance coube: ele segue na vitrine, sem lances, à espera de um novo primeiro lance
    delete from ofertas_livres where jogador_id = j.id;
    update jogadores set livre_ate = null, livre_inicio = null where id = j.id and clube_id = v_l.vitrine;
  end loop;
  return n;
end $$;
revoke execute on function public.resolver_vitrine(bigint) from public, anon;
grant execute on function public.resolver_vitrine(bigint) to authenticated, service_role;

create or replace function public.dar_lance_vitrine(p_jogador bigint, p_valor int, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_l ligas%rowtype; v_j jogadores%rowtype; v_lider ofertas_livres%rowtype;
  v_motivo text; v_prometido int; v_fim timestamptz; v_caixa int;
begin
  select * into v_c from clubes where id = public.meu_clube();
  if v_c.id is null or v_c.dono is null then raise exception 'Você não tem clube.'; end if;
  perform resolver_vitrine(v_c.liga_id);
  select * into v_l from ligas where id = v_c.liga_id;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_l.vitrine is null or v_j.id is null or v_j.clube_id is distinct from v_l.vitrine then raise exception 'Esse jogador não está na vitrine.'; end if;
  if janela_do_mercado(v_l.id) is null then raise exception 'A vitrine só aceita lances com a janela de transferências aberta.'; end if;
  if v_j.vitrine_dono = v_c.dono then raise exception 'Você vendeu esse jogador ao agente: não pode dar lance nele, por nenhum dos seus clubes.'; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario_mercado, 0) then raise exception 'Ele pede pelo menos % mil por temporada.', coalesce(v_j.salario_mercado, 0); end if;
  if p_valor is null or p_valor < coalesce(v_j.vitrine_minimo, 0) then raise exception 'O lance mínimo é de % mil.', coalesce(v_j.vitrine_minimo, 0); end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < p_valor then raise exception 'Seu caixa (% mil) não cobre esse lance.', coalesce(v_caixa, 0); end if;
  v_motivo := coalesce(impedimento_de_contrato(v_c.id, p_salario), vaga_no_elenco(v_c.id, v_j.idade), vaga_de_estrangeiro(v_c.id, v_j.id));
  if v_motivo is not null then raise exception 'Não dá para fazer esse lance: %.', v_motivo; end if;
  v_prometido := folha_prometida(v_c.id, p_jogador);
  if v_prometido > 0 and folha_no_teto(v_c.id) + v_prometido + p_salario > teto_do_clube(v_c.id) then
    raise exception 'Não dá para fazer esse lance: a folha mais os lances em que você está na frente em outros leilões (% mil) mais este (% mil) passariam do teto de % mil.',
      v_prometido, p_salario, teto_do_clube(v_c.id);
  end if;
  select * into v_lider from ofertas_livres where jogador_id = p_jogador and clube_id <> v_c.id order by valor desc nulls last, salario desc, criada_em, id limit 1;
  if v_lider.id is not null and (p_valor, p_salario) <= (coalesce(v_lider.valor, 0), v_lider.salario) then
    raise exception 'O maior lance é de % mil, com salário de % mil. O seu precisa de valor maior, ou do mesmo valor com salário maior.', v_lider.valor, v_lider.salario;
  end if;
  v_fim := v_j.livre_ate;
  if v_fim is null then -- primeiro lance: o prazo começa agora
    v_fim := fim_do_leilao(now(), coalesce(v_l.horas_leilao, 48));
    update jogadores set livre_ate = v_fim, livre_inicio = now() where id = p_jogador;
  elsif v_fim - now() <= interval '3 minutes' then -- reta final: estende
    v_fim := now() + interval '3 minutes';
    update jogadores set livre_ate = v_fim where id = p_jogador;
  end if;
  insert into ofertas_livres (jogador_id, clube_id, salario, temporadas, valor) values (p_jogador, v_c.id, p_salario, p_temporadas, p_valor)
    on conflict (jogador_id, clube_id) do update set salario = excluded.salario, temporadas = excluded.temporadas, valor = excluded.valor, criada_em = now();
  return 'Lance registrado. O leilão termina em ' || to_char(v_fim at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.dar_lance_vitrine(bigint, int, int, int) from public, anon;
grant execute on function public.dar_lance_vitrine(bigint, int, int, int) to authenticated;

-- remendos na versão no ar, sem copiar o corpo (como no 150)
do $$
declare d text; antigo text;
begin
  -- vender_pelo_agente: o destino é a vitrine, com o lance mínimo e quem vendeu
  select pg_get_functiondef('public.vender_pelo_agente(bigint)'::regprocedure) into d;
  if d not like '%vitrine_da_liga%' then
    antigo := d;
    d := regexp_replace(d, 'select c\.id, c\.nome into v_destino, v_nome from clubes c.*?limit 1;',
      'v_destino := vitrine_da_liga(v_l.id); v_nome := ''Vitrine do agente''; -- 152: o vendido vai a leilão na vitrine');
    d := replace(d, 'update jogadores set clube_id = v_destino, salario = v_mercado,',
      'perform set_config(''trem.vitrine'', ''1'', true);
  update jogadores set clube_id = v_destino, vitrine_minimo = greatest(v_valor, 3 * v_mercado), vitrine_dono = v_c.dono, livre_ate = null, livre_inicio = null, salario = v_mercado,');
    d := replace(d, ''' vendido pelo agente ao '' || v_nome || '' por '' || v_valor || '' mil.''',
      ''' vendido pelo agente por '' || v_valor || '' mil. Ele vai a leilão na vitrine.''');
    if d not like '%v_destino := vitrine_da_liga(v_l.id)%' or d not like '%vitrine_dono = v_c.dono%' or d like '%from clubes c%limit 1;%' then
      raise exception 'vender_pelo_agente: trecho do destino não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;

  -- resolver_leiloes: resolve também a vitrine
  select pg_get_functiondef('public.resolver_leiloes(bigint)'::regprocedure) into d;
  if d not like '%resolver_vitrine%' then
    antigo := d;
    d := replace(d, 'select temporada, horas_leilao into v_temp, v_horas from ligas where id = p_liga;',
      'select temporada, horas_leilao into v_temp, v_horas from ligas where id = p_liga;
  n := n + resolver_vitrine(p_liga); -- 152');
    if d = antigo then raise exception 'resolver_leiloes: trecho do início não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;

  -- virar_temporada: quem ficou na vitrine sem lance sai do jogo
  select pg_get_functiondef('public.virar_temporada(bigint, jsonb)'::regprocedure) into d;
  if d not like '%152: vitrine%' then
    antigo := d;
    d := replace(d, '  -- 4. jogadores: quem fica, quem se aposenta, quem chega',
      '  -- 152: vitrine sem lance até a virada: o jogador sai do jogo (vai para o exterior)
  delete from jogadores x where x.clube_id = (select vitrine from ligas where id = p_liga)
    and not exists (select 1 from ofertas_livres o where o.jogador_id = x.id);

  -- 4. jogadores: quem fica, quem se aposenta, quem chega');
    if d = antigo then raise exception 'virar_temporada: trecho do passo 4 não encontrado; nada foi trocado.'; end if;
    execute d;
  end if;
end $$;

-- conferência: tudo true
select p.proname,
  case p.proname when 'vender_pelo_agente' then pg_get_functiondef(p.oid) like '%vitrine_da_liga%'
                 when 'resolver_leiloes' then pg_get_functiondef(p.oid) like '%resolver_vitrine%'
                 when 'virar_temporada' then pg_get_functiondef(p.oid) like '%152: vitrine%' end as remendado
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('vender_pelo_agente', 'resolver_leiloes', 'virar_temporada');
