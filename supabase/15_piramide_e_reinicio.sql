-- Trem Soccer · fase 2, passo V1: pirâmide de divisões, histórico de temporadas e reinício do teste.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 14_estruturas_e_obras.sql já executado. Não exige publicar a função "rodada" de novo.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares por temporada.
-- Nada muda na liga em andamento até o administrador clicar em "Reiniciar o teste": só então os grupos viram divisões.

-- ---------- divisões ----------
-- Grupo A = primeira divisão; B e C = segunda; D e E = terceira.
create or replace function public.divisao_do_grupo(p_grupo text) returns smallint language sql immutable as $$
  select (case when p_grupo = 'A' then 1 when p_grupo in ('B', 'C') then 2 else 3 end)::smallint
$$;

alter table public.clubes add column if not exists divisao smallint not null default 2; -- até o reinício, todos com os valores da segunda

create table if not exists public.divisoes (
  liga_id bigint not null references public.ligas on delete cascade,
  divisao smallint not null,
  teto_folha int not null,
  receita_tv int not null,
  receita_patrocinio int not null,
  preco_ingresso int not null,
  torcida_base int not null,
  primary key (liga_id, divisao)
);
alter table public.divisoes enable row level security;
drop policy if exists divisoes_ler on public.divisoes;
create policy divisoes_ler on public.divisoes for select to anon, authenticated using (true);
drop policy if exists divisoes_admin on public.divisoes;
create policy divisoes_admin on public.divisoes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create or replace function public.criar_divisoes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into divisoes (liga_id, divisao, teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base) values
    (new.id, 1, 20000, 6500, 5200, 25, 20000),
    (new.id, 2, 14000, 4500, 3600, 24, 14000),
    (new.id, 3, 10000, 4200, 3400, 22, 10000)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists ligas_divisoes on public.ligas;
create trigger ligas_divisoes after insert on public.ligas for each row execute function public.criar_divisoes();
insert into public.divisoes (liga_id, divisao, teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base)
  select l.id, d.divisao, d.teto, d.tv, d.pat, d.ingresso, d.torcida from public.ligas l,
    (values (1, 20000, 6500, 5200, 25, 20000), (2, 14000, 4500, 3600, 24, 14000), (3, 10000, 4200, 3400, 22, 10000)) as d(divisao, teto, tv, pat, ingresso, torcida)
  on conflict do nothing;

-- ---------- histórico de temporadas (preenchido na virada, passo V2) ----------
create table if not exists public.historico (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  clube_id bigint not null references public.clubes on delete cascade,
  divisao smallint not null,
  grupo text not null,
  posicao smallint not null,
  pontos smallint not null,
  vitorias smallint not null, empates smallint not null, derrotas smallint not null,
  gols_pro smallint not null, gols_contra smallint not null,
  premio int not null default 0,
  destino text, -- campeão, subiu, caiu, ficou
  primary key (liga_id, temporada, clube_id)
);
alter table public.historico enable row level security;
drop policy if exists historico_ler on public.historico;
create policy historico_ler on public.historico for select to anon, authenticated using (true);

-- ---------- estado inicial do teste ----------
-- Cópia dos jogadores (com o talento oculto) para o reinício. Ninguém lê direto: só as funções abaixo.
create table if not exists public.estado_inicial (
  liga_id bigint primary key references public.ligas on delete cascade,
  temporada int not null,
  jogadores jsonb not null,
  ocultos jsonb not null,
  guardado_em timestamptz not null default now()
);
alter table public.estado_inicial enable row level security;

create or replace function public.copiar_estado(p_liga bigint, p_substituir boolean) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not p_substituir and exists (select 1 from estado_inicial where liga_id = p_liga) then return 0; end if;
  insert into estado_inicial (liga_id, temporada, jogadores, ocultos, guardado_em)
  select p_liga, (select temporada from ligas where id = p_liga),
    (select coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]') from jogadores j join clubes c on c.id = j.clube_id where c.liga_id = p_liga),
    (select coalesce(jsonb_agg(to_jsonb(o)), '[]') from jogadores_ocultos o join jogadores j on j.id = o.jogador_id join clubes c on c.id = j.clube_id where c.liga_id = p_liga),
    now()
  on conflict (liga_id) do update set temporada = excluded.temporada, jogadores = excluded.jogadores, ocultos = excluded.ocultos, guardado_em = now();
  select jsonb_array_length(jogadores) into n from estado_inicial where liga_id = p_liga;
  return n;
end $$;
revoke execute on function public.copiar_estado(bigint, boolean) from public, anon, authenticated;

-- Guarda o elenco de agora como estado inicial (substitui a cópia anterior). Só administrador.
create or replace function public.guardar_estado_inicial(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador guarda o estado inicial.'; end if;
  return copiar_estado(p_liga, true);
end $$;
revoke execute on function public.guardar_estado_inicial(bigint) from public, anon;
grant execute on function public.guardar_estado_inicial(bigint) to authenticated;

-- Reinicia o teste: apaga calendário, resultados, extratos, obras e histórico; devolve os jogadores ao estado inicial
-- (idade, atributos, salários e contratos; ninguém lesionado ou suspenso); caixa de 5 mi, estádio no nível 1, estruturas
-- no zero, humor no meio; grupos viram divisões. Mantém os dirigentes, os clubes e as táticas salvas.
-- p_sortear: espalha os dirigentes por igual entre os grupos, trocando de lugar com clubes do bot.
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

  delete from partidas where liga_id = p_liga; -- leva junto lances e resultados
  delete from historico where liga_id = p_liga;
  delete from lancamentos where clube_id in (select id from clubes where liga_id = p_liga);
  delete from obras where clube_id in (select id from clubes where liga_id = p_liga);

  delete from jogadores where clube_id in (select id from clubes where liga_id = p_liga);
  insert into jogadores overriding system value
    select * from jsonb_populate_recordset(null::jogadores,
      (select jsonb_agg(x || '{"fora_jogos": 0, "fora_motivo": null, "amarelos": 0}'::jsonb) from jsonb_array_elements(v_e.jogadores) x));
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
    torcida = (select d.torcida_base from divisoes d where d.liga_id = p_liga and d.divisao = divisao_do_grupo(c.grupo))
  where c.liga_id = p_liga;
  insert into financas (clube_id, caixa) select id, 5000 from clubes where liga_id = p_liga
    on conflict (clube_id) do update set caixa = 5000;
  update ligas set temporada = v_e.temporada, pausada = false, pausada_em = null where id = p_liga;
  return 'Teste reiniciado: ' || jsonb_array_length(v_e.jogadores) || ' jogadores de volta ao estado de ' || to_char(v_e.guardado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.reiniciar_teste(bigint, boolean) from public, anon;
grant execute on function public.reiniciar_teste(bigint, boolean) to authenticated;

-- ---------- contratos: o teto de folha passa a ser o da divisão do clube ----------
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  select coalesce((select teto_folha from divisoes where liga_id = v_c.liga_id and divisao = v_c.divisao), v_l.teto_folha) into v_teto;
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas > 0 and p_salario < v_j.salario_mercado then raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_c.id;
  if v_folha - v_j.salario + p_salario > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_teto;
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
end $$;

-- ---------- lançamentos da rodada: TV, patrocínio, ingresso e torcida-base da divisão ----------
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
  v_tv int; v_pat int; v_folha int; v_manut int; v_total int;
  v_publico int; v_bilheteria int;
  v_saldo int; v_dh numeric; v_dt numeric;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_r from resultados where partida_id = p_partida;
  select * into v_c from clubes where id = v_p.casa;
  -- jogo de liga: os dois clubes são da mesma divisão
  select * into v_d from divisoes where liga_id = v_p.liga_id and divisao = v_c.divisao;
  if v_d.liga_id is null then
    v_d.receita_tv := v_l.receita_tv; v_d.receita_patrocinio := v_l.receita_patrocinio;
    v_d.preco_ingresso := v_l.preco_ingresso; v_d.torcida_base := v_l.torcida_base;
  end if;
  v_tv := round(v_d.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_d.receita_patrocinio::numeric / v_l.rodadas_por_temporada);

  v_publico := least(5000 + 5000 * v_c.estadio_nivel,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)));
  v_bilheteria := round(v_publico * v_d.preco_ingresso / 1000.0);
  update partidas set publico = v_publico where id = p_partida;

  foreach v_clube in array array[v_p.casa, v_p.fora] loop
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
    if v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria, 'Bilheteria (' || v_publico || ' pagantes)');
      v_total := v_total + v_bilheteria;
    end if;
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)
      on conflict (clube_id) do update set caixa = financas.caixa + v_total;

    -- obra em andamento: uma rodada a menos; ao terminar, a estrutura sobe de nível
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

    if v_r.partida_id is not null then
      v_saldo := case when v_clube = v_p.casa then v_r.gols_casa - v_r.gols_fora else v_r.gols_fora - v_r.gols_casa end;
      if v_saldo > 0 then v_dh := 1; v_dt := 0.01;
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

-- ---------- primeira cópia: o elenco de agora vira o estado inicial das ligas que ainda não têm um ----------
select l.nome as liga, public.copiar_estado(l.id, false) as jogadores_guardados from public.ligas l;
