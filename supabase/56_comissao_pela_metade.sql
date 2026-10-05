-- Trem Soccer · comissão técnica pela metade do preço.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Não precisa republicar função nenhuma. Pode ser executado mais de uma vez (o corte nos salários atuais só acontece na primeira).
--
-- Quando o treino foi refeito, o efeito dos treinadores caiu pela metade (de 80%-130% para 90%-115%) e o salário ficou igual:
-- uma comissão de primeira custava mais de 4 mi por temporada, 40% da folha de um clube da Série B. Agora o salário acompanha o efeito:
--   treinador: 5 + skill principal² / 8 + um quarto da soma das outras (skill 45: cerca de 280 mil; skill 20: cerca de 65 mil);
--   médico, preparadores, psicólogo, olheiro e analista: 5 + skill² / 8.
-- Vale para os candidatos novos e para todos os que já existem, contratados ou na lista.

alter table public.treinadores add column if not exists tabela_salarial smallint; -- 2: salário já na tabela nova
update public.treinadores set salario = greatest(5, round(salario / 2.0)::int), tabela_salarial = 2 where tabela_salarial is null;
alter table public.treinadores alter column tabela_salarial set default 2;

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
          values (v_c.id, v_nome, 35 + floor(random() * 31)::int, v_skills, 5 + round(v_s * v_s / 8.0 + v_soma / 4.0)::int, v_principal, 'treinador');
      else
        insert into treinadores (clube_id, nome, idade, skills, salario, area, funcao, skill)
          values (v_c.id, v_nome, 30 + floor(random() * 36)::int, '{}'::jsonb, 5 + round(v_s * v_s / 8.0)::int, v_funcao, v_funcao, v_s);
      end if;
    end loop;
    update clubes set candidatos_em = now() where id = v_c.id;
  end if;
  return query select * from treinadores where clube_id = v_c.id and not contratado order by funcao desc, salario desc;
end $$;
revoke execute on function public.candidatos_a_treinador() from public, anon;
grant execute on function public.candidatos_a_treinador() to authenticated;
