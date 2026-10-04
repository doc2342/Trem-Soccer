-- Trem Soccer · fase 2, passo M3: jogadores livres com leilão aberto, fim da renovação automática e oferta à liga do clube no vermelho.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 20_venda_negociada.sql já executado. Vale republicar a função "rodada", para os leilões fecharem sozinhos no horário.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.

alter table public.jogadores alter column clube_id drop not null;                                        -- jogador livre não tem clube
alter table public.jogadores add column if not exists livre_liga bigint references public.ligas on delete cascade; -- liga em que está livre
alter table public.jogadores add column if not exists livre_ate timestamptz;                             -- fim do leilão
alter table public.jogadores add column if not exists oferta_liga_ate timestamptz;                       -- oferecido à liga por clube no vermelho, até quando
alter table public.ligas add column if not exists horas_leilao numeric not null default 48;              -- duração do leilão dos livres
alter table public.ligas add column if not exists horas_oferta numeric not null default 168;             -- duração da oferta à liga (uma semana)
create index if not exists jogadores_livres on public.jogadores (livre_liga) where livre_liga is not null;

-- lances pelos jogadores livres: abertos, todo mundo vê
create table if not exists public.ofertas_livres (
  id bigint generated always as identity primary key,
  jogador_id bigint not null references public.jogadores on delete cascade,
  clube_id bigint not null references public.clubes on delete cascade,
  salario int not null,
  temporadas int not null,
  criada_em timestamptz not null default now(),
  unique (jogador_id, clube_id)
);
alter table public.ofertas_livres enable row level security;
drop policy if exists ofertas_livres_ler on public.ofertas_livres;
create policy ofertas_livres_ler on public.ofertas_livres for select to anon, authenticated using (true);

-- Troca de clube: sai da lista de transferência, sai da oferta à liga e as propostas abertas caem.
create or replace function public.jogador_mudou_de_clube() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clube_id is distinct from old.clube_id then
    new.a_venda := false; new.preco_pedido := null; new.oferta_liga_ate := null;
    update propostas set estado = 'cancelada', motivo = 'O jogador mudou de clube.', atualizada_em = now()
      where jogador_id = new.id and estado in ('pendente', 'contra');
  end if;
  return new;
end $$;

-- Na virada: os jogadores com contrato vencido dos clubes com dirigente ficam livres e entram em leilão.
-- Quem ficou livre na virada anterior e ninguém contratou sai do jogo. p_lista: [{ id, salario_mercado }]. Só administrador.
create or replace function public.liberar_jogadores(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_fim timestamptz; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador libera jogadores.'; end if;
  delete from jogadores where livre_liga = p_liga;
  select now() + make_interval(secs => (horas_leilao * 3600)::int) into v_fim from ligas where id = p_liga;
  update jogadores j set clube_id = null, livre_liga = p_liga, livre_ate = v_fim, salario = null, salario_mercado = x.salario_mercado,
      contrato_ate = null, protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, salario_mercado int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.liberar_jogadores(bigint, jsonb) from public, anon;
grant execute on function public.liberar_jogadores(bigint, jsonb) to authenticated;

-- O clube pode assinar com o jogador por esse salário? Devolve o motivo de não poder, ou nulo.
create or replace function public.impedimento_de_contrato(p_clube bigint, p_salario int) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_teto int; v_folha int;
begin
  v_teto := teto_do_clube(p_clube);
  if p_salario > v_teto * 0.15 then return 'um jogador não pode ganhar mais de 15% do teto de folha'; end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = p_clube;
  if v_folha + p_salario > v_teto then return 'a folha passaria do teto'; end if;
  if (select count(*) from jogadores where clube_id = p_clube) >= 50 then return 'o elenco já tem 50 jogadores'; end if;
  return null;
end $$;

-- Assina com o jogador livre. Uso interno.
create or replace function public.contratar_livre(p_jogador bigint, p_clube bigint, p_salario int, p_temporadas int) returns void
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_j jogadores%rowtype;
begin
  select l.* into v_l from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube;
  select * into v_j from jogadores where id = p_jogador;
  update jogadores set clube_id = p_clube, livre_liga = null, livre_ate = null, salario = p_salario, contrato_ate = v_l.temporada + p_temporadas,
    protegido_ate = v_l.temporada, chegou_temporada = v_l.temporada, chegou_janela = coalesce(janela_do_mercado(v_l.id), 'inicio')
    where id = p_jogador;
  delete from ofertas_livres where jogador_id = p_jogador;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, janela_do_mercado(v_l.id), 'livre', v_j.id, v_j.nome, v_j.pos, null, p_clube, 0);
end $$;
revoke execute on function public.contratar_livre(bigint, bigint, int, int) from public, anon, authenticated;

-- Fecha o que venceu: leilões de livres (leva o maior salário entre os lances que ainda cabem no clube) e ofertas à liga de
-- clubes no vermelho que ninguém comprou (o jogador vai ao banco por 60% da multa). Pode ser chamada por qualquer um, quantas vezes for.
create or replace function public.resolver_leiloes(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare j record; o record; n int := 0; v_temp int;
begin
  select temporada into v_temp from ligas where id = p_liga;
  for j in select id from jogadores where livre_liga = p_liga and clube_id is null and livre_ate <= now()
            and exists (select 1 from ofertas_livres x where x.jogador_id = jogadores.id) loop
    for o in select * from ofertas_livres where jogador_id = j.id order by salario desc, criada_em, id loop
      if impedimento_de_contrato(o.clube_id, o.salario) is null then
        perform contratar_livre(j.id, o.clube_id, o.salario, o.temporadas);
        n := n + 1;
        exit;
      end if;
    end loop;
    delete from ofertas_livres where jogador_id = j.id; -- se nenhum lance coube, o jogador segue livre, sem lances
  end loop;
  for j in select x.id, x.nome, x.salario, x.clube_id from jogadores x join clubes c on c.id = x.clube_id
            where c.liga_id = p_liga and x.oferta_liga_ate is not null and x.oferta_liga_ate <= now() loop
    if (select count(*) from jogadores where clube_id = j.clube_id) > 16 and coalesce((select caixa from financas where clube_id = j.clube_id), 0) < 0 then
      delete from jogadores where id = j.id;
      update financas set caixa = caixa + 3 * coalesce(j.salario, 0) where clube_id = j.clube_id;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (j.clube_id, v_temp, null, 'banco', 3 * coalesce(j.salario, 0), 'Oferta à liga sem comprador, vendido ao banco: ' || j.nome);
      n := n + 1;
    else
      update jogadores set oferta_liga_ate = null where id = j.id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.resolver_leiloes(bigint) from public, anon;
grant execute on function public.resolver_leiloes(bigint) to authenticated, service_role;

-- Lance por um jogador livre. Durante o leilão: precisa cobrir o que ele pede e superar o maior lance; leva o maior salário
-- quando o prazo acaba. Depois do leilão, se ninguém levou: assina na hora quem oferecer pelo menos o que ele pede.
create or replace function public.dar_lance_livre(p_jogador bigint, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_j jogadores%rowtype;
  v_maior int; v_motivo text;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  perform resolver_leiloes(v_c.liga_id);
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null or v_j.clube_id is not null or v_j.livre_liga is distinct from v_c.liga_id then raise exception 'Esse jogador não está livre.'; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario_mercado, 0) then raise exception 'Ele pede pelo menos % mil por temporada.', coalesce(v_j.salario_mercado, 0); end if;
  v_motivo := impedimento_de_contrato(v_c.id, p_salario);
  if v_motivo is not null then raise exception 'Não dá para fazer esse lance: %.', v_motivo; end if;
  if v_j.livre_ate <= now() then
    perform contratar_livre(p_jogador, v_c.id, p_salario, p_temporadas);
    return v_j.nome || ' contratado.';
  end if;
  select max(salario) into v_maior from ofertas_livres where jogador_id = p_jogador and clube_id <> v_c.id;
  if v_maior is not null and p_salario <= v_maior then raise exception 'Já existe um lance de % mil. O seu precisa ser maior.', v_maior; end if;
  insert into ofertas_livres (jogador_id, clube_id, salario, temporadas) values (p_jogador, v_c.id, p_salario, p_temporadas)
    on conflict (jogador_id, clube_id) do update set salario = excluded.salario, temporadas = excluded.temporadas, criada_em = now();
  return 'Lance registrado. O leilão termina em ' || to_char(v_j.livre_ate at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.dar_lance_livre(bigint, int, int) from public, anon;
grant execute on function public.dar_lance_livre(bigint, int, int) to authenticated;

-- ---------- terceira saída do clube no vermelho: oferecer o jogador à liga por 75% da multa ----------
-- Durante o prazo (uma semana), qualquer clube leva pagando 75% da multa, mesmo com a janela fechada e mesmo que o jogador
-- fosse protegido. Se ninguém levar, ele vai ao banco por 60%.
create or replace function public.oferecer_a_liga(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype; v_fim timestamptz;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) >= 0 then raise exception 'A oferta à liga só existe para sair do vermelho, e o seu caixa não está negativo.'; end if;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if v_j.salario is null then raise exception 'Esse jogador não tem contrato definido.'; end if;
  select now() + make_interval(secs => (horas_oferta * 3600)::int) into v_fim from ligas where id = v_c.liga_id;
  update jogadores set oferta_liga_ate = v_fim where id = p_jogador;
  return 'Oferecido à liga por ' || round(3.75 * v_j.salario) || ' mil até ' || to_char(v_fim at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.oferecer_a_liga(bigint) from public, anon;
grant execute on function public.oferecer_a_liga(bigint) to authenticated;

create or replace function public.comprar_oferta_da_liga(p_jogador bigint, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_preco int; v_motivo text;
begin
  select * into v_para from clubes where dono = auth.uid();
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.oferta_liga_ate is null or v_j.oferta_liga_ate <= now() then raise exception 'Esse jogador não está mais oferecido à liga.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.liga_id <> v_para.liga_id then raise exception 'O jogador é de outra liga.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < greatest(v_j.salario, coalesce(v_j.salario_mercado, 0)) then
    raise exception 'O salário novo não pode ser menor que % mil por temporada.', greatest(v_j.salario, coalesce(v_j.salario_mercado, 0));
  end if;
  v_motivo := impedimento_de_contrato(v_para.id, p_salario);
  if v_motivo is not null then raise exception 'Não dá para contratar: %.', v_motivo; end if;
  v_preco := round(3.75 * v_j.salario);
  if coalesce((select caixa from financas where clube_id = v_para.id), 0) < v_preco then raise exception 'Caixa insuficiente: o preço é de % mil.', v_preco; end if;
  update financas set caixa = caixa - v_preco where clube_id = v_para.id;
  update financas set caixa = caixa + v_preco where clube_id = v_de.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_para.id, v_l.temporada, null, 'compra', -v_preco, 'Oferta da liga: ' || v_j.nome || ' (' || v_de.nome || ')'),
    (v_de.id, v_l.temporada, null, 'venda', v_preco, 'Vendido pela oferta à liga: ' || v_j.nome || ' (' || v_para.nome || ')');
  update jogadores set clube_id = v_para.id, salario = p_salario, contrato_ate = v_l.temporada + p_temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada,
    chegou_janela = coalesce(janela_do_mercado(v_l.id), 'inicio')
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, janela_do_mercado(v_l.id), 'divida', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, v_preco);
  return v_j.nome || ' contratado por ' || v_preco || ' mil.';
end $$;
revoke execute on function public.comprar_oferta_da_liga(bigint, int, int) from public, anon;
grant execute on function public.comprar_oferta_da_liga(bigint, int, int) to authenticated;

-- ---------- reinício do teste: também apaga os jogadores livres ----------
create or replace function public.reiniciar_teste(p_liga bigint, p_sortear boolean default true) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_e estado_inicial%rowtype;
  v_grupos text[];
  v_g text; v_alvo text; v_bot bigint;
  r record;
  n int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador reinicia o teste.'; end if;
  select * into v_e from estado_inicial where liga_id = p_liga;
  if v_e.liga_id is null then raise exception 'Não há estado inicial guardado para esta liga.'; end if;

  delete from partidas where liga_id = p_liga;
  delete from historico where liga_id = p_liga;
  delete from lancamentos where clube_id in (select id from clubes where liga_id = p_liga);
  delete from obras where clube_id in (select id from clubes where liga_id = p_liga);
  delete from transferencias where liga_id = p_liga;
  delete from jogadores where livre_liga = p_liga; -- jogadores livres não têm clube

  delete from jogadores where clube_id in (select id from clubes where liga_id = p_liga);
  insert into jogadores overriding system value
    select * from jsonb_populate_recordset(null::jogadores,
      (select jsonb_agg(x || '{"fora_jogos": 0, "fora_motivo": null, "amarelos": 0, "protegido": false, "chegou_temporada": null}'::jsonb) from jsonb_array_elements(v_e.jogadores) x));
  insert into jogadores_ocultos select * from jsonb_populate_recordset(null::jogadores_ocultos, v_e.ocultos);

  if p_sortear then
    select array_agg(g order by g) into v_grupos from (select distinct grupo g from clubes where liga_id = p_liga) x;
    for r in select id from clubes where liga_id = p_liga and dono is not null order by random() loop
      v_alvo := v_grupos[n % array_length(v_grupos, 1) + 1];
      n := n + 1;
      select grupo into v_g from clubes where id = r.id;
      if v_g <> v_alvo then
        select id into v_bot from clubes where liga_id = p_liga and grupo = v_alvo and dono is null order by random() limit 1;
        if v_bot is not null then
          update clubes set grupo = v_g where id = v_bot;
          update clubes set grupo = v_alvo where id = r.id;
        end if;
      end if;
    end loop;
  end if;

  update clubes c set divisao = divisao_do_grupo(c.grupo), estadio_nivel = 1, humor = 8,
    ct_nivel = 0, medico_nivel = 0, fisio_nivel = 0, base_nivel = 0,
    paraquedas = null, carne = 0, carne_temporada = null, vermelho_rodadas = 0, premio_antecipado = 0, antecipou_temporada = null,
    torcida = (select d.torcida_base from divisoes d where d.liga_id = p_liga and d.divisao = divisao_do_grupo(c.grupo))
  where c.liga_id = p_liga;
  insert into financas (clube_id, caixa) select id, 5000 from clubes where liga_id = p_liga
    on conflict (clube_id) do update set caixa = 5000;
  update ligas set temporada = v_e.temporada, pausada = false, pausada_em = null, fundo_taca = 0 where id = p_liga;
  return 'Teste reiniciado: ' || jsonb_array_length(v_e.jogadores) || ' jogadores de volta ao estado de ' || to_char(v_e.guardado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.reiniciar_teste(bigint, boolean) from public, anon;
grant execute on function public.reiniciar_teste(bigint, boolean) to authenticated;
