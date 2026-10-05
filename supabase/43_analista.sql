-- Trem Soccer · fase 2: analista de desempenho.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 36_olheiro.sql já executado. Depois, republicar a função "rodada". Pode ser executado mais de uma vez.
--
-- O analista é mais um funcionário da comissão (um por clube, na lista de candidatos, skill de 1 a 50). Ele faz duas coisas:
--   1. o comentário depois de cada partida: sem analista vem só o básico (o resultado foi justo? faltou pontaria?);
--      com analista de skill até 24, entram as zonas do campo; com skill 25 ou mais, entram os jogadores e as bolas paradas;
--   2. a prévia do próximo adversário, na aba Tática: formação provável, estilo de jogo e, com skill alta, a dica de como enfrentar.
-- Aqui só muda a lista de candidatos, que passa a ter 2 analistas (20 nomes no total).

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
     or not exists (select 1 from treinadores where clube_id = v_c.id and funcao = 'analista') then -- lista gerada antes deste arquivo: refaz, para trazer os profissionais novos
    delete from treinadores where clube_id = v_c.id and not contratado;
    for i in 1..20 loop
      v_funcao := case when i <= 8 then 'treinador' when i <= 10 then 'medico' when i <= 12 then 'prevencao' when i <= 14 then 'forma' when i <= 16 then 'psicologo' when i <= 18 then 'olheiro' else 'analista' end;
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
    values (v_c.id, v_temp, null, 'treinadores', -v_luvas, 'Luvas de ' || v_t.nome || case v_t.funcao when 'medico' then ' (médico)' when 'prevencao' then ' (prevenção)' when 'forma' then ' (preparador de forma)' when 'psicologo' then ' (psicólogo)' when 'olheiro' then ' (olheiro)' when 'analista' then ' (analista)' else ' (treinador)' end);
  update treinadores set contratado = true where id = p_id;
  return v_t.nome || ' contratado.';
end $$;
revoke execute on function public.contratar_treinador(bigint) from public, anon;
grant execute on function public.contratar_treinador(bigint) to authenticated;
