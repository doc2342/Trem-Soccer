-- Trem Soccer · fase 2, passo E4: estruturas, estádio e obras.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 13_torcida_e_bilheteria.sql já executado. Não exige publicar a função "rodada" de novo.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.
-- Enquanto o calendário é de teste, o prazo das obras corre em rodadas de liga (uma temporada = 18 rodadas = 13 semanas).

alter table public.clubes add column if not exists ct_nivel smallint not null default 0;      -- centro de treinamento
alter table public.clubes add column if not exists medico_nivel smallint not null default 0;  -- departamento médico
alter table public.clubes add column if not exists fisio_nivel smallint not null default 0;   -- fisioterapia
alter table public.clubes add column if not exists base_nivel smallint not null default 0;    -- base

create table if not exists public.obras (
  id bigint generated always as identity primary key,
  clube_id bigint not null references public.clubes on delete cascade,
  estrutura text not null,            -- ct, medico, fisio, base ou estadio
  nivel_alvo smallint not null,
  custo int not null,
  rodadas_total smallint not null,
  rodadas_restantes smallint not null,
  concluida boolean not null default false,
  criada_em timestamptz not null default now()
);
create unique index if not exists obras_uma_por_clube on public.obras (clube_id) where not concluida; -- uma obra por vez
alter table public.obras enable row level security;
drop policy if exists obras_ler on public.obras;
create policy obras_ler on public.obras for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));

-- Custo de levar uma estrutura ao nível indicado.
create or replace function public.custo_da_obra(p_estrutura text, p_nivel int) returns int language sql immutable as $$
  select case when p_estrutura = 'estadio' then (array[null, 1500, 3000, 5000, 8000])[p_nivel]
              else (array[250, 500, 1000, 2000, 4000])[p_nivel] end
$$;
-- Prazo em rodadas de liga: 1, 2, 4, 8 e 13 semanas viram 1, 3, 6, 11 e 18 rodadas.
create or replace function public.prazo_da_obra(p_nivel int) returns int language sql immutable as $$
  select (array[1, 3, 6, 11, 18])[p_nivel]
$$;
-- Manutenção por temporada das quatro estruturas: 10% do que já foi gasto em cada uma.
create or replace function public.manutencao_por_temporada(p_clube bigint) returns int language sql stable set search_path = public as $$
  select round(0.10 * (select coalesce(sum((array[0, 250, 750, 1750, 3750, 7750])[n + 1]), 0)
    from clubes c, unnest(array[c.ct_nivel, c.medico_nivel, c.fisio_nivel, c.base_nivel]) n where c.id = p_clube))::int
$$;

-- Começa uma obra no próprio clube: uma por vez, um nível acima do atual, pagando tudo no início.
create or replace function public.iniciar_obra(p_estrutura text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_nivel int; v_custo int; v_caixa int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_estrutura not in ('ct', 'medico', 'fisio', 'base', 'estadio') then raise exception 'Estrutura desconhecida.'; end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida) then raise exception 'Já existe uma obra em andamento. Só cabe uma por vez.'; end if;
  v_nivel := 1 + case p_estrutura when 'ct' then v_c.ct_nivel when 'medico' then v_c.medico_nivel when 'fisio' then v_c.fisio_nivel
    when 'base' then v_c.base_nivel else v_c.estadio_nivel end;
  if v_nivel > 5 then raise exception 'Essa estrutura já está no nível máximo.'; end if;
  v_custo := custo_da_obra(p_estrutura, v_nivel);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo then raise exception 'Caixa insuficiente: a obra custa % mil e o caixa é de % mil.', v_custo, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: ' || p_estrutura || ' para o nível ' || v_nivel);
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, p_estrutura, v_nivel, v_custo, prazo_da_obra(v_nivel), prazo_da_obra(v_nivel));
end $$;
revoke execute on function public.iniciar_obra(text) from public, anon;
grant execute on function public.iniciar_obra(text) to authenticated;

-- Lançamentos de uma partida de liga. Só roda uma vez por partida.
-- Para os dois clubes: TV, patrocínio, salários, manutenção das estruturas e uma rodada a menos na obra em andamento.
-- Para o mandante: bilheteria. Para os dois: efeito do resultado no humor e na torcida.
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_r resultados%rowtype;
  v_c clubes%rowtype;
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
  v_tv := round(v_l.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_l.receita_patrocinio::numeric / v_l.rodadas_por_temporada);

  select * into v_c from clubes where id = v_p.casa;
  v_publico := least(5000 + 5000 * v_c.estadio_nivel,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)));
  v_bilheteria := round(v_publico * v_l.preco_ingresso / 1000.0);
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
        torcida = least(round(v_l.torcida_base * 1.4), greatest(round(v_l.torcida_base * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;
