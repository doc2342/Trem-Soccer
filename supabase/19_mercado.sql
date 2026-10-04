-- Trem Soccer · fase 2, passo M1: mercado — janelas, protegidos e compra pela multa rescisória.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 18_fim_de_temporada.sql já executado, e da função "mercado" publicada (supabase/functions/mercado/index.ts).
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.
-- Enquanto o calendário é de teste, as janelas correm em rodadas de liga: início até o fim da rodada 2; meio entre as rodadas 9 e 11.

alter table public.jogadores add column if not exists protegido boolean default false;          -- na lista de protegidos: sem multa rescisória
alter table public.jogadores add column if not exists chegou_temporada int;                     -- temporada em que chegou ao clube atual (para a taxa da venda negociada)

-- histórico de transferências, visível para todos
create table if not exists public.transferencias (
  id bigint generated always as identity primary key,
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  janela text,                 -- inicio ou meio
  tipo text not null,          -- multa, negociada, …
  jogador_id bigint,
  jogador text not null,
  pos text,
  de_clube bigint references public.clubes on delete set null,
  para_clube bigint references public.clubes on delete set null,
  valor int not null,
  taxa int not null default 0,
  criada_em timestamptz not null default now()
);
create index if not exists transferencias_liga on public.transferencias (liga_id, id desc);
alter table public.transferencias enable row level security;
drop policy if exists transferencias_ler on public.transferencias;
create policy transferencias_ler on public.transferencias for select to anon, authenticated using (true);

-- Rodadas de liga já calculadas por inteiro na temporada em curso.
create or replace function public.rodadas_completas(p_liga bigint) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from (select rodada from partidas where liga_id = p_liga and fase = 'liga' group by rodada having bool_and(processada)) x
$$;
-- Janela aberta: 'inicio' (até o fim da rodada 2), 'meio' (entre as rodadas 9 e 11) ou nulo (fechada).
create or replace function public.janela_do_mercado(p_liga bigint) returns text
language sql stable security definer set search_path = public as $$
  select case when rodadas_completas(p_liga) < 2 then 'inicio' when rodadas_completas(p_liga) in (9, 10) then 'meio' else null end
$$;
grant execute on function public.rodadas_completas(bigint) to anon, authenticated;
grant execute on function public.janela_do_mercado(bigint) to anon, authenticated;

-- Lista de protegidos: até 5 jogadores por clube ficam sem multa rescisória. Incluir pode a qualquer momento;
-- tirar alguém da lista (para trocar por outro) só com a janela fechada.
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
    if (select count(*) from jogadores where clube_id = v_c.id and protegido) >= 5 then raise exception 'A lista de protegidos já tem 5 jogadores.'; end if;
  else
    if janela_do_mercado(v_c.liga_id) is not null then raise exception 'Com a janela aberta, ninguém sai da lista de protegidos.'; end if;
  end if;
  update jogadores set protegido = p_proteger where id = p_jogador;
end $$;
revoke execute on function public.proteger_jogador(bigint, boolean) from public, anon;
grant execute on function public.proteger_jogador(bigint, boolean) to authenticated;

-- Compra pela multa rescisória. Chamada só pela função "mercado" do servidor, que identifica o comprador pelo login
-- e, quando o vendedor é um clube sem dono, manda junto o jogador gerado para repor (p_reposicao).
create or replace function public.comprar_pela_multa(p_user uuid, p_jogador bigint, p_salario int, p_temporadas int, p_reposicao jsonb default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_janela text;
  v_multa int; v_teto int; v_folha int; v_caixa int; v_jogos int; v_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_para from clubes where dono = p_user;
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.liga_id <> v_para.liga_id then raise exception 'O jogador é de outra liga.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null then raise exception 'O mercado está fechado. As janelas são até o fim da rodada 2 e entre as rodadas 9 e 11.'; end if;

  -- quem tem multa
  if v_j.salario is null then raise exception 'Esse jogador ainda não tem contrato definido.'; end if;
  if v_j.protegido then raise exception 'Esse jogador está na lista de protegidos do clube: não tem multa rescisória.'; end if;
  if coalesce(v_j.protegido_ate, -1) >= v_l.temporada then raise exception 'Esse jogador está na primeira temporada de contrato no clube: a multa só vale a partir da próxima.'; end if;
  v_multa := 5 * v_j.salario;

  -- travas
  if v_para.divisao > v_de.divisao then raise exception 'O jogador não desce de divisão pela multa rescisória.'; end if;
  if v_janela = 'meio' and v_para.divisao = v_de.divisao then
    select count(*) into v_jogos from resultados r join partidas p on p.id = r.partida_id
      where p.liga_id = v_l.id and p.fase = 'liga' and (p.casa = v_de.id or p.fora = v_de.id)
        and exists (select 1 from jsonb_array_elements(r.relatorio->'jogadores') x where x->>'id' = 'j' || v_j.id);
    if v_jogos >= 5 then raise exception 'Na janela do meio, quem já jogou 5 partidas de liga pelo clube não vai para outro da mesma divisão (ele jogou %).', v_jogos; end if;
  end if;
  if (select count(*) from transferencias where para_clube = v_para.id and temporada = v_l.temporada and tipo = 'multa') >= 4 then
    raise exception 'Você já fez as 4 compras pela multa desta temporada.';
  end if;
  if (select count(*) from transferencias where de_clube = v_de.id and temporada = v_l.temporada and tipo = 'multa') >= (case when v_de.dono is null then 2 else 3 end) then
    raise exception 'Esse clube já perdeu o máximo de jogadores pela multa nesta temporada.';
  end if;
  if v_de.dono is null and exists (select 1 from transferencias where de_clube = v_de.id and temporada = v_l.temporada and tipo = 'multa' and janela = v_janela) then
    raise exception 'Clube sem dono só perde um jogador por janela, e este já perdeu.';
  end if;
  if (select count(*) from jogadores where clube_id = v_para.id) >= 50 then raise exception 'Seu elenco já tem 50 jogadores.'; end if;

  -- contrato novo
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < greatest(v_j.salario, coalesce(v_j.salario_mercado, 0)) then
    raise exception 'O salário novo não pode ser menor que % mil por temporada.', greatest(v_j.salario, coalesce(v_j.salario_mercado, 0));
  end if;
  v_teto := teto_do_clube(v_para.id);
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_para.id;
  if v_folha + p_salario > v_teto then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + p_salario, v_teto; end if;

  -- dinheiro
  select caixa into v_caixa from financas where clube_id = v_para.id;
  if coalesce(v_caixa, 0) < v_multa then raise exception 'Caixa insuficiente: a multa é de % mil e o seu caixa é de % mil.', v_multa, coalesce(v_caixa, 0); end if;
  update financas set caixa = caixa - v_multa where clube_id = v_para.id;
  insert into financas (clube_id, caixa) values (v_de.id, 5000 + v_multa) on conflict (clube_id) do update set caixa = financas.caixa + v_multa;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_para.id, v_l.temporada, null, 'compra', -v_multa, 'Multa rescisória paga: ' || v_j.nome || ' (' || v_de.nome || ')'),
    (v_de.id, v_l.temporada, null, 'venda', v_multa, 'Multa rescisória recebida: ' || v_j.nome || ' (' || v_para.nome || ')');

  -- o jogador muda de clube, com contrato novo e protegido até o fim da temporada
  update jogadores set clube_id = v_para.id, salario = p_salario, contrato_ate = v_l.temporada + p_temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, v_janela, 'multa', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, v_multa);

  -- clube sem dono repõe com um jogador gerado da mesma nota
  if v_de.dono is null and p_reposicao is not null then
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, chegou_temporada)
      values (v_de.id, p_reposicao->>'nome', coalesce(p_reposicao->>'pais', 'Brasil'), (p_reposicao->>'idade')::smallint, p_reposicao->>'pos', p_reposicao->'fam',
        array(select jsonb_array_elements_text(p_reposicao->'at')::smallint), v_j.principal,
        (p_reposicao->>'salario')::int, (p_reposicao->>'salario_mercado')::int, (p_reposicao->>'contrato_ate')::int, (p_reposicao->>'protegido_ate')::int, v_l.temporada)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (p_reposicao->>'tal')::smallint);
  end if;
  return v_j.nome || ' contratado por ' || v_multa || ' mil de multa rescisória.';
end $$;
revoke execute on function public.comprar_pela_multa(uuid, bigint, int, int, jsonb) from public, anon, authenticated;
grant execute on function public.comprar_pela_multa(uuid, bigint, int, int, jsonb) to service_role;

-- ---------- reinício do teste: também apaga as transferências e zera a lista de protegidos ----------
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
