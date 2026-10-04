-- Trem Soccer · fase 2: olheiro. Mostra o teto de um jogador (até onde o treino pode levá-lo) como uma faixa de nota.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 30_forma_e_moral.sql já executado. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Jogadores do próprio clube: o olheiro é um funcionário (um por clube, na lista de candidatos, skill de 1 a 50).
--   Com ele contratado, o elenco inteiro ganha a faixa de teto; a largura vai de 16 pontos de nota (skill 1) a 3 (skill 50).
-- Jogadores de outros clubes: relatório pago, em três níveis: 25 mil (faixa de 16 pontos), 75 mil (8) e 200 mil (4).
-- A faixa de um jogador é sempre a mesma para a mesma skill ou o mesmo nível de relatório: pedir de novo não estreita.
-- O teto verdadeiro está sempre dentro da faixa, mas não necessariamente no meio.

create table if not exists public.relatorios (
  clube_id bigint not null references public.clubes on delete cascade,
  jogador_id bigint not null references public.jogadores on delete cascade,
  nivel smallint not null,
  minimo int not null,
  maximo int not null,
  temporada int not null,
  criado_em timestamptz not null default now(),
  primary key (clube_id, jogador_id, nivel)
);
alter table public.relatorios enable row level security;
drop policy if exists relatorios_ler on public.relatorios;
create policy relatorios_ler on public.relatorios for select to authenticated using (clube_id in (select id from clubes where dono = auth.uid()));

-- Faixa do teto de um jogador. Uso interno: quem chama já conferiu a permissão.
create or replace function public.teto_em_faixa(p_jogador bigint, p_largura numeric, p_chave text) returns int[]
language plpgsql stable security definer set search_path = public as $$
declare v_tal int; v_teto numeric; v_u numeric; v_min numeric;
begin
  select tal into v_tal from jogadores_ocultos where jogador_id = p_jogador;
  v_teto := 24 + 0.22 * coalesce(v_tal, 50);
  v_u := (('x' || substr(md5(p_jogador::text || ':' || p_chave), 1, 6))::bit(24)::int) / 16777216.0; -- de 0 a 1, fixo para cada jogador e chave
  v_min := v_teto - p_largura * v_u;
  return array[floor(v_min)::int, least(50, ceil(v_min + p_largura)::int)];
end $$;
revoke execute on function public.teto_em_faixa(bigint, numeric, text) from public, anon, authenticated;

-- Relatório do olheiro do clube sobre o próprio elenco.
create or replace function public.relatorio_do_elenco() returns table (jogador_id bigint, minimo int, maximo int)
language plpgsql stable security definer set search_path = public as $$
declare v_clube bigint; v_skill int; v_largura numeric;
begin
  select id into v_clube from clubes where dono = auth.uid();
  if v_clube is null then return; end if;
  select max(skill) into v_skill from treinadores where clube_id = v_clube and contratado and funcao = 'olheiro';
  if v_skill is null then return; end if;
  v_largura := 16 - 13 * least(50, v_skill) / 50.0;
  return query select j.id, (x.faixa)[1], (x.faixa)[2] from jogadores j cross join lateral (select teto_em_faixa(j.id, v_largura, 'o' || v_skill) as faixa) x where j.clube_id = v_clube;
end $$;
revoke execute on function public.relatorio_do_elenco() from public, anon;
grant execute on function public.relatorio_do_elenco() to authenticated;

-- Relatório pago sobre um jogador de outro clube da liga. p_nivel: 1 (25 mil), 2 (75 mil) ou 3 (200 mil).
create or replace function public.comprar_relatorio(p_jogador bigint, p_nivel int) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_j jogadores%rowtype; v_preco int; v_largura numeric; v_f int[]; v_temp int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_nivel not in (1, 2, 3) then raise exception 'Nível de relatório desconhecido.'; end if;
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  if v_j.clube_id = v_c.id then raise exception 'Para o seu elenco, quem avalia é o olheiro do clube.'; end if;
  if coalesce((select liga_id from clubes where id = v_j.clube_id), v_j.livre_liga) is distinct from v_c.liga_id then raise exception 'O jogador é de outra liga.'; end if;
  if exists (select 1 from relatorios where clube_id = v_c.id and jogador_id = p_jogador and nivel = p_nivel) then raise exception 'Você já tem esse relatório.'; end if;
  v_preco := case p_nivel when 1 then 25 when 2 then 75 else 200 end;
  v_largura := case p_nivel when 1 then 16 when 2 then 8 else 4 end;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) < v_preco then raise exception 'Caixa insuficiente: o relatório custa % mil.', v_preco; end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  v_f := teto_em_faixa(p_jogador, v_largura, 'r' || p_nivel);
  update financas set caixa = caixa - v_preco where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (v_c.id, v_temp, null, 'olheiro', -v_preco, 'Relatório de olheiro: ' || v_j.nome);
  insert into relatorios (clube_id, jogador_id, nivel, minimo, maximo, temporada) values (v_c.id, p_jogador, p_nivel, v_f[1], v_f[2], v_temp);
  return 'Relatório de ' || v_j.nome || ': teto entre ' || v_f[1] || ' e ' || v_f[2] || '.';
end $$;
revoke execute on function public.comprar_relatorio(bigint, int) from public, anon;
grant execute on function public.comprar_relatorio(bigint, int) to authenticated;

-- lista de candidatos: 8 treinadores, 2 de cada profissional de saúde e 2 olheiros
create or replace function public.candidatos_a_treinador() returns setof public.treinadores
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_horas numeric; i int; k int;
  v_areas text[] := array['gol', 'def', 'mei', 'ata', 'fis', 'tat'];
  v_nomes text[] := array['Abel', 'Adilson', 'Ademir', 'Alberto', 'Antônio', 'Carlos', 'Celso', 'Cláudio', 'Dorival', 'Edu', 'Emerson', 'Enderson', 'Fábio', 'Fernando', 'Gilson', 'Givanildo', 'Hélio', 'Jair', 'Jorge', 'Lisca', 'Luiz', 'Mano', 'Marcelo', 'Mário', 'Nelsinho', 'Osvaldo', 'Paulo', 'Renato', 'Roger', 'Rogério', 'Sérgio', 'Tite', 'Vagner', 'Zé'];
  v_sobrenomes text[] := array['Alves', 'Barbieri', 'Batista', 'Braga', 'Cabral', 'Carpini', 'Ceni', 'Chamusca', 'Conceição', 'Diniz', 'Dias', 'Ferreira', 'Fonseca', 'Gaúcho', 'Jardim', 'Kleina', 'Lopes', 'Machado', 'Mancini', 'Menezes', 'Moreira', 'Oliveira', 'Paiva', 'Portugal', 'Ramalho', 'Ribeiro', 'Sampaio', 'Santana', 'Silva', 'Soares', 'Tencati', 'Turra', 'Ventura', 'Zago'];
  v_principal text; v_s int; v_o int; v_soma int; v_skills jsonb; v_funcao text; v_nome text;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select horas_candidatos into v_horas from ligas where id = v_c.liga_id;
  if v_c.candidatos_em is null or v_c.candidatos_em + make_interval(secs => (v_horas * 3600)::int) <= now()
     or not exists (select 1 from treinadores where clube_id = v_c.id and funcao = 'olheiro') then -- lista gerada antes deste arquivo: refaz, para trazer os profissionais novos
    delete from treinadores where clube_id = v_c.id and not contratado;
    for i in 1..18 loop
      v_funcao := case when i <= 8 then 'treinador' when i <= 10 then 'medico' when i <= 12 then 'prevencao' when i <= 14 then 'forma' when i <= 16 then 'psicologo' else 'olheiro' end;
      v_nome := v_nomes[1 + floor(random() * array_length(v_nomes, 1))::int] || ' ' || v_sobrenomes[1 + floor(random() * array_length(v_sobrenomes, 1))::int];
      v_s := 8 + round(42 * power(random(), 2.5))::int; -- a maioria entre 10 e 30; acima de 40 é raro
      if v_funcao = 'treinador' then
        v_principal := v_areas[1 + floor(random() * 6)::int];
        v_skills := '{}'::jsonb; v_soma := 0;
        for k in 1..6 loop
          if v_areas[k] = v_principal then v_o := v_s; else v_o := greatest(1, round(v_s * (0.2 + 0.5 * random()))::int); v_soma := v_soma + v_o; end if;
          v_skills := v_skills || jsonb_build_object(v_areas[k], v_o);
        end loop;
        insert into treinadores (clube_id, nome, idade, skills, salario, area, funcao)
          values (v_c.id, v_nome, 35 + floor(random() * 31)::int, v_skills, 10 + round(v_s * v_s / 4.0 + v_soma / 2.0)::int, v_principal, 'treinador');
      else
        insert into treinadores (clube_id, nome, idade, skills, salario, area, funcao, skill)
          values (v_c.id, v_nome, 30 + floor(random() * 36)::int, '{}'::jsonb, 10 + round(v_s * v_s / 4.0)::int, v_funcao, v_funcao, v_s);
      end if;
    end loop;
    update clubes set candidatos_em = now() where id = v_c.id;
  end if;
  return query select * from treinadores where clube_id = v_c.id and not contratado order by funcao desc, salario desc;
end $$;
revoke execute on function public.candidatos_a_treinador() from public, anon;
grant execute on function public.candidatos_a_treinador() to authenticated;

create or replace function public.contratar_treinador(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_t treinadores%rowtype; v_luvas int; v_caixa int; v_temp int; v_tem int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_t from treinadores where id = p_id and clube_id = v_c.id for update;
  if v_t.id is null or v_t.contratado then raise exception 'Esse candidato não está mais na sua lista.'; end if;
  select count(*) into v_tem from treinadores where clube_id = v_c.id and contratado and funcao = v_t.funcao;
  if v_t.funcao = 'treinador' and v_tem >= 5 then raise exception 'O clube já tem 5 treinadores.'; end if;
  if v_t.funcao <> 'treinador' and v_tem >= 1 then raise exception 'O clube já tem um profissional nessa função: dispense o atual para contratar outro.'; end if;
  v_luvas := round(v_t.salario * 0.10);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_luvas then raise exception 'Caixa insuficiente: as luvas são de % mil.', v_luvas; end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_luvas where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_temp, null, 'treinadores', -v_luvas, 'Luvas de ' || v_t.nome || case v_t.funcao when 'medico' then ' (médico)' when 'prevencao' then ' (prevenção)' when 'forma' then ' (preparador de forma)' when 'psicologo' then ' (psicólogo)' when 'olheiro' then ' (olheiro)' else ' (treinador)' end);
  update treinadores set contratado = true where id = p_id;
  return v_t.nome || ' contratado.';
end $$;
revoke execute on function public.contratar_treinador(bigint) from public, anon;
grant execute on function public.contratar_treinador(bigint) to authenticated;
