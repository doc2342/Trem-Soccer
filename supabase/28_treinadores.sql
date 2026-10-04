-- Trem Soccer · fase 2, passo T2: treinadores (candidatos, contratação, área de treino e salário).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 27_treino.sql já executado. Depois, republicar a função "rodada": é ela que usa os treinadores no treino e cobra o salário deles.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.
--
-- Cada clube tem a sua própria lista de candidatos, renovada de tempos em tempos (ligas.horas_candidatos, uma semana).
-- Skills de 1 a 50 em seis áreas: gol (goleiros), def (defesa), mei (meio), ata (ataque), fis (físico) e tat (tática).
-- O treinador trabalha numa área só (vale a skill inteira dele ali) ou como "geral" (40% de cada skill em todas as áreas).
-- Até 5 treinadores por clube. Na contratação o clube paga luvas de 10% do salário da temporada; o salário sai a cada rodada de liga.

alter table public.ligas add column if not exists horas_candidatos numeric not null default 168;
alter table public.clubes add column if not exists candidatos_em timestamptz; -- quando a lista de candidatos do clube foi gerada

create table if not exists public.treinadores (
  id bigint generated always as identity primary key,
  clube_id bigint not null references public.clubes on delete cascade,
  contratado boolean not null default false, -- false: candidato na lista do clube
  nome text not null,
  idade smallint not null,
  skills jsonb not null,                     -- { gol, def, mei, ata, fis, tat }
  salario int not null,                      -- por temporada
  area text not null default 'geral',        -- geral, gol, def, mei, ata, fis ou tat
  criado_em timestamptz not null default now()
);
create index if not exists treinadores_clube on public.treinadores (clube_id);
alter table public.treinadores enable row level security;
drop policy if exists treinadores_ler on public.treinadores;
create policy treinadores_ler on public.treinadores for select to anon, authenticated using (true);

-- Lista de candidatos do meu clube; gera uma nova quando a atual venceu (ou ainda não existe).
create or replace function public.candidatos_a_treinador() returns setof public.treinadores
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_horas numeric; i int; k int;
  v_areas text[] := array['gol', 'def', 'mei', 'ata', 'fis', 'tat'];
  v_nomes text[] := array['Abel', 'Adilson', 'Ademir', 'Alberto', 'Antônio', 'Carlos', 'Celso', 'Cláudio', 'Dorival', 'Edu', 'Emerson', 'Enderson', 'Fábio', 'Fernando', 'Gilson', 'Givanildo', 'Hélio', 'Jair', 'Jorge', 'Lisca', 'Luiz', 'Mano', 'Marcelo', 'Mário', 'Nelsinho', 'Osvaldo', 'Paulo', 'Renato', 'Roger', 'Rogério', 'Sérgio', 'Tite', 'Vagner', 'Zé'];
  v_sobrenomes text[] := array['Alves', 'Barbieri', 'Batista', 'Braga', 'Cabral', 'Carpini', 'Ceni', 'Chamusca', 'Conceição', 'Diniz', 'Dias', 'Ferreira', 'Fonseca', 'Gaúcho', 'Jardim', 'Kleina', 'Lopes', 'Machado', 'Mancini', 'Menezes', 'Moreira', 'Oliveira', 'Paiva', 'Portugal', 'Ramalho', 'Ribeiro', 'Sampaio', 'Santana', 'Silva', 'Soares', 'Tencati', 'Turra', 'Ventura', 'Zago'];
  v_principal text; v_s int; v_o int; v_soma int; v_skills jsonb;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select horas_candidatos into v_horas from ligas where id = v_c.liga_id;
  if v_c.candidatos_em is null or v_c.candidatos_em + make_interval(secs => (v_horas * 3600)::int) <= now() then
    delete from treinadores where clube_id = v_c.id and not contratado;
    for i in 1..8 loop
      v_principal := v_areas[1 + floor(random() * 6)::int];
      v_s := 8 + round(42 * power(random(), 2.5))::int; -- a maioria entre 10 e 30; acima de 40 é raro
      v_skills := '{}'::jsonb; v_soma := 0;
      for k in 1..6 loop
        if v_areas[k] = v_principal then v_o := v_s; else v_o := greatest(1, round(v_s * (0.2 + 0.5 * random()))::int); v_soma := v_soma + v_o; end if;
        v_skills := v_skills || jsonb_build_object(v_areas[k], v_o);
      end loop;
      insert into treinadores (clube_id, nome, idade, skills, salario, area)
        values (v_c.id, v_nomes[1 + floor(random() * array_length(v_nomes, 1))::int] || ' ' || v_sobrenomes[1 + floor(random() * array_length(v_sobrenomes, 1))::int],
          35 + floor(random() * 31)::int, v_skills, 10 + round(v_s * v_s / 4.0 + v_soma / 2.0)::int, v_principal);
    end loop;
    update clubes set candidatos_em = now() where id = v_c.id;
  end if;
  return query select * from treinadores where clube_id = v_c.id and not contratado order by salario desc;
end $$;
revoke execute on function public.candidatos_a_treinador() from public, anon;
grant execute on function public.candidatos_a_treinador() to authenticated;

create or replace function public.contratar_treinador(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_t treinadores%rowtype; v_luvas int; v_caixa int; v_temp int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_t from treinadores where id = p_id and clube_id = v_c.id for update;
  if v_t.id is null or v_t.contratado then raise exception 'Esse candidato não está mais na sua lista.'; end if;
  if (select count(*) from treinadores where clube_id = v_c.id and contratado) >= 5 then raise exception 'O clube já tem 5 treinadores.'; end if;
  v_luvas := round(v_t.salario * 0.10);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_luvas then raise exception 'Caixa insuficiente: as luvas são de % mil.', v_luvas; end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_luvas where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_temp, null, 'treinadores', -v_luvas, 'Luvas do treinador ' || v_t.nome);
  update treinadores set contratado = true where id = p_id;
  return v_t.nome || ' contratado.';
end $$;
revoke execute on function public.contratar_treinador(bigint) from public, anon;
grant execute on function public.contratar_treinador(bigint) to authenticated;

create or replace function public.dispensar_treinador(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  delete from treinadores t using clubes c where t.id = p_id and t.contratado and c.id = t.clube_id and c.dono = auth.uid() returning t.nome into v_nome;
  if v_nome is null then raise exception 'Esse treinador não é do seu clube.'; end if;
  return v_nome || ' dispensado.';
end $$;
revoke execute on function public.dispensar_treinador(bigint) from public, anon;
grant execute on function public.dispensar_treinador(bigint) to authenticated;

create or replace function public.designar_treinador(p_id bigint, p_area text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_area not in ('geral', 'gol', 'def', 'mei', 'ata', 'fis', 'tat') then raise exception 'Área de treino desconhecida.'; end if;
  update treinadores t set area = p_area from clubes c where t.id = p_id and t.contratado and c.id = t.clube_id and c.dono = auth.uid();
  if not found then raise exception 'Esse treinador não é do seu clube.'; end if;
end $$;
revoke execute on function public.designar_treinador(bigint, text) from public, anon;
grant execute on function public.designar_treinador(bigint, text) to authenticated;

-- Salário dos treinadores dos dois clubes, a cada partida de liga. Só a função do servidor (ou o administrador) chama; não cobra duas vezes a mesma rodada.
create or replace function public.lancar_treinadores(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_p partidas%rowtype; v_l ligas%rowtype; v_clube bigint; v_valor int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida;
  if v_p.id is null or v_p.fase <> 'liga' then return; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    select round(coalesce(sum(salario), 0)::numeric / v_l.rodadas_por_temporada)::int into v_valor from treinadores where clube_id = v_clube and contratado;
    if v_valor > 0 and not exists (select 1 from lancamentos where clube_id = v_clube and temporada = v_l.temporada and rodada = v_p.rodada and tipo = 'treinadores') then
      update financas set caixa = caixa - v_valor where clube_id = v_clube;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'treinadores', -v_valor, 'Salários dos treinadores');
    end if;
  end loop;
end $$;
revoke execute on function public.lancar_treinadores(bigint) from public, anon, authenticated;
grant execute on function public.lancar_treinadores(bigint) to authenticated, service_role;

-- Para o reinício do teste: apaga treinadores e listas de candidatos da liga. Só administrador.
create or replace function public.limpar_treinadores(p_liga bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  delete from treinadores where clube_id in (select id from clubes where liga_id = p_liga);
  update clubes set candidatos_em = null where liga_id = p_liga;
end $$;
revoke execute on function public.limpar_treinadores(bigint) from public, anon;
grant execute on function public.limpar_treinadores(bigint) to authenticated;
