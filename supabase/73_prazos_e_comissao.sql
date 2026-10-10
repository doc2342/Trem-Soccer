-- Trem Soccer · prazos no ritmo do calendário e mais candidatos na comissão técnica.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 71_nomes_da_comissao.sql e do 72_bots_compram_listados.sql. Não exige republicar função. Pode ser executado mais de uma vez.
--
-- 1. Prazos: no calendário de verdade (uma data por dia ou mais), valem os prazos normais: leilão dos livres de 48 h, oferta à liga e
--    lista de candidatos de 7 dias, 24 h de espera até os bots olharem um jogador listado. Em calendário de teste, com as rodadas a
--    minutos uma da outra, um "dia" passa a ser o intervalo entre a rodada 1 e a rodada 2: leilão = 2 intervalos, oferta e candidatos = 7,
--    espera dos bots = 1. O administrador chama ajustar_prazos ao gerar o calendário (a página faz sozinha).
-- 2. Comissão: a lista de candidatos passa de 20 para 36 nomes. Treinadores: 2 de cada área (antes 8 com a área sorteada: podia não vir
--    nenhum de goleiros). Demais funções: 4 de cada (antes 2). O primeiro de cada área ou função é o melhor de dois sorteios.
--    Chance de a lista trazer alguém de skill 35 ou mais: treinador de goleiros de 20% para 41%; olheiro e analista de 30% para 59%.
--    O salário segue a mesma tabela (quem é bom continua caro).

-- ---------- 1. prazos ----------
create or replace function public.ajustar_prazos(p_liga bigint) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_dia numeric;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.eh_admin()) then raise exception 'Sem permissão.'; end if;
  -- o "dia" do calendário, em horas: da rodada 1 à rodada 2 da liga, no máximo 24
  select least(24, extract(epoch from (select min(inicio) from partidas where liga_id = p_liga and fase = 'liga' and rodada = 2)
                                    - (select min(inicio) from partidas where liga_id = p_liga and fase = 'liga' and rodada = 1)) / 3600.0) into v_dia;
  if v_dia is null or v_dia <= 0 then return null; end if; -- sem calendário: fica como está
  update ligas set horas_leilao = greatest(0.05, round(2 * v_dia, 2)), horas_oferta = greatest(0.05, round(7 * v_dia, 2)),
    horas_candidatos = greatest(0.05, round(7 * v_dia, 2)), bots_espera_horas = greatest(0.02, round(v_dia, 2)) where id = p_liga;
  return v_dia;
end $$;
revoke execute on function public.ajustar_prazos(bigint) from public, anon;
grant execute on function public.ajustar_prazos(bigint) to authenticated, service_role;

-- ---------- 2. comissão ----------
create or replace function public.candidatos_a_treinador() returns setof public.treinadores
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_horas numeric; i int; k int;
  v_areas text[] := array['gol', 'def', 'mei', 'ata', 'fis', 'tat'];
  v_funcoes text[] := array['medico', 'prevencao', 'forma', 'psicologo', 'olheiro', 'analista'];
  v_nomes text[] := array['Abel', 'Ademir', 'Adilson', 'Alberto', 'Antônio', 'Carlos', 'Celso', 'Cláudio', 'Dorival', 'Edu', 'Eduardo', 'Emerson', 'Enderson', 'Fernando', 'Filipe', 'Fábio', 'Gerson', 'Gilson', 'Givanildo', 'Hélio', 'Jair', 'Jorge', 'Lisca', 'Luiz', 'Luizinho', 'Mano', 'Marcelo', 'Matheus', 'Mário', 'Nelsinho', 'Odair', 'Osvaldo', 'Paulo', 'Rafael', 'Renato', 'Roger', 'Rogério', 'Sérgio', 'Tite', 'Vagner', 'Zé'];
  v_sobrenomes text[] := array['Alves', 'Baptista', 'Barbieri', 'Batista', 'Braga', 'Cabral', 'Carpini', 'Ceni', 'Chamusca', 'Conceição', 'Costa', 'Dias', 'Diniz', 'Ferreira', 'Fonseca', 'Gaúcho', 'Guanaes', 'Gusmão', 'Hellmann', 'Jardim', 'Kleina', 'Lopes', 'Luis', 'Machado', 'Mancini', 'Menezes', 'Moreira', 'Oliveira', 'Paiva', 'Portugal', 'Ramalho', 'Ribeiro', 'Sampaio', 'Santana', 'Seabra', 'Silva', 'Soares', 'Tencati', 'Turra', 'Valentim', 'Ventura', 'Zago'];
  v_principal text; v_s int; v_o int; v_soma int; v_skills jsonb; v_funcao text; v_nome text; v_primeiro boolean;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select horas_candidatos into v_horas from ligas where id = v_c.liga_id;
  if v_c.candidatos_em is null or v_c.candidatos_em + make_interval(secs => (v_horas * 3600)::int) <= now() then
    delete from treinadores where clube_id = v_c.id and not contratado;
    for i in 1..36 loop
      -- 1 a 12: treinadores, dois de cada área; 13 a 36: quatro de cada uma das outras funções
      if i <= 12 then v_funcao := 'treinador'; v_principal := v_areas[(i + 1) / 2]; v_primeiro := i % 2 = 1;
      else v_funcao := v_funcoes[(i - 9) / 4]; v_primeiro := (i - 13) % 4 = 0; end if;
      v_nome := v_nomes[1 + floor(random() * array_length(v_nomes, 1))::int] || ' ' || v_sobrenomes[1 + floor(random() * array_length(v_sobrenomes, 1))::int];
      v_s := 8 + round(42 * power(random(), 2.5))::int; -- a maioria entre 10 e 30; acima de 40 é raro
      if v_primeiro then v_s := greatest(v_s, 8 + round(42 * power(random(), 2.5))::int); end if; -- o primeiro de cada grupo: o melhor de dois sorteios
      if v_funcao = 'treinador' then
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

-- todo clube recebe a lista nova na próxima vez que abrir os candidatos
update public.clubes set candidatos_em = null;

-- ligas que já têm calendário entram no ritmo agora
do $$ declare l record; begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  for l in select id from ligas loop perform ajustar_prazos(l.id); end loop;
end $$;

select id, horas_leilao, horas_oferta, horas_candidatos, bots_espera_horas from public.ligas;
