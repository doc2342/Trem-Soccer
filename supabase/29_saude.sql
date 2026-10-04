-- Trem Soccer · fase 2, passo T3 (primeira parte): médico e preparador de prevenção.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 28_treinadores.sql já executado. Depois, republicar a função "rodada".
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.
--
-- Os dois profissionais entram na mesma tabela e na mesma lista de candidatos dos treinadores, com uma skill só (1 a 50):
--   médico: a cada rodada de liga, cada lesionado atendido tem de 15% a 65% de chance de voltar um jogo antes;
--           ele atende 1 lesionado por rodada, mais 1 por nível do departamento médico;
--   preparador de prevenção: reduz de 10% a 40% a chance de lesão de todo o elenco.
-- Um de cada por clube. Salário e luvas seguem a regra dos treinadores e saem no mesmo lançamento.

alter table public.treinadores add column if not exists funcao text not null default 'treinador'; -- treinador, medico ou prevencao
alter table public.treinadores add column if not exists skill smallint;                          -- skill única dos profissionais de saúde

-- Lista de candidatos do meu clube: 8 treinadores, 2 médicos e 2 preparadores de prevenção; gera uma nova quando a atual venceu.
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
     or not exists (select 1 from treinadores where clube_id = v_c.id and not contratado and funcao <> 'treinador') and not exists (select 1 from treinadores where clube_id = v_c.id and funcao <> 'treinador') then
    delete from treinadores where clube_id = v_c.id and not contratado;
    for i in 1..12 loop
      v_funcao := case when i <= 8 then 'treinador' when i <= 10 then 'medico' else 'prevencao' end;
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
  if v_t.funcao = 'medico' and v_tem >= 1 then raise exception 'O clube já tem médico: dispense o atual para contratar outro.'; end if;
  if v_t.funcao = 'prevencao' and v_tem >= 1 then raise exception 'O clube já tem preparador de prevenção: dispense o atual para contratar outro.'; end if;
  v_luvas := round(v_t.salario * 0.10);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_luvas then raise exception 'Caixa insuficiente: as luvas são de % mil.', v_luvas; end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_luvas where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_temp, null, 'treinadores', -v_luvas, 'Luvas de ' || v_t.nome || case v_t.funcao when 'medico' then ' (médico)' when 'prevencao' then ' (prevenção)' else ' (treinador)' end);
  update treinadores set contratado = true where id = p_id;
  return v_t.nome || ' contratado.';
end $$;
revoke execute on function public.contratar_treinador(bigint) from public, anon;
grant execute on function public.contratar_treinador(bigint) to authenticated;

-- a área de treino só existe para treinador
create or replace function public.designar_treinador(p_id bigint, p_area text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_area not in ('geral', 'gol', 'def', 'mei', 'ata', 'fis', 'tat') then raise exception 'Área de treino desconhecida.'; end if;
  update treinadores t set area = p_area from clubes c where t.id = p_id and t.contratado and t.funcao = 'treinador' and c.id = t.clube_id and c.dono = auth.uid();
  if not found then raise exception 'Esse treinador não é do seu clube.'; end if;
end $$;
revoke execute on function public.designar_treinador(bigint, text) from public, anon;
grant execute on function public.designar_treinador(bigint, text) to authenticated;

-- o lançamento da rodada passa a se chamar "comissão técnica", já que inclui médico e preparador
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
        values (v_clube, v_l.temporada, v_p.rodada, 'treinadores', -v_valor, 'Salários da comissão técnica');
    end if;
  end loop;
end $$;
revoke execute on function public.lancar_treinadores(bigint) from public, anon;
grant execute on function public.lancar_treinadores(bigint) to authenticated, service_role;
