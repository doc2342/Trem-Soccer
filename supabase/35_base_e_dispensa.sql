-- Trem Soccer · fase 2: base (peneira do meio da temporada) e dispensa de jogadores.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 32_limite_do_elenco.sql já executado. Depois, republicar a função "mercado": é ela que gera os jovens da peneira.
-- Pode ser executado mais de uma vez sem apagar dados.
--
-- A promoção da base na virada não precisa de SQL novo: os jovens entram pelo plano da virada, que a página do administrador monta.
-- Peneira: a partir da rodada 9, uma vez por temporada, o dirigente chama a peneira e recebe os jovens que o nível da base render.
-- Dispensa: jogador de até 21 anos ou de 31 anos ou mais pode ser dispensado sem custo; ele fica livre e vai a leilão.

alter table public.clubes add column if not exists peneira_temporada int; -- temporada em que o clube já fez a peneira

-- Recebe os jovens gerados pela função do servidor. p_lista: [{ nome, pais, idade, pos, fam, at, tal, salario, salario_mercado, contrato_ate, protegido_ate }].
create or replace function public.receber_jovens(p_user uuid, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_l ligas%rowtype; r record; v_id bigint; n int := 0;
begin
  select * into v_c from clubes where dono = p_user for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if rodadas_completas(v_l.id) < 9 then raise exception 'A peneira só acontece a partir da rodada 9.'; end if;
  if v_c.peneira_temporada is not distinct from v_l.temporada then raise exception 'A peneira desta temporada já foi feita.'; end if;
  update clubes set peneira_temporada = v_l.temporada where id = v_c.id;
  for r in select value as v from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    exit when vaga_no_elenco(v_c.id, (r.v->>'idade')::int) is not null; -- elenco cheio: os que não couberem ficam de fora
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values (v_c.id, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    n := n + 1;
  end loop;
  return case n when 0 then 'A peneira desta temporada não revelou ninguém.' when 1 then 'A peneira revelou 1 jogador.' else 'A peneira revelou ' || n || ' jogadores.' end;
end $$;
revoke execute on function public.receber_jovens(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.receber_jovens(uuid, jsonb) to service_role;

-- Dispensa sem custo: até 21 anos ou a partir de 31. O jogador fica livre e espera o primeiro lance do leilão.
create or replace function public.dispensar_jogador(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if v_j.idade between 22 and 30 then raise exception 'Só dá para dispensar jogador de até 21 anos ou de 31 anos ou mais. Os outros saem pela lista de transferência.'; end if;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if exists (select 1 from partidas p where (p.casa = v_c.id or p.fora = v_c.id) and p.processada and p.fim > now()) then
    raise exception 'Há uma partida do seu clube em andamento. Dispense depois do apito final.';
  end if;
  update jogadores set clube_id = null, livre_liga = v_c.liga_id, livre_ate = null, livre_inicio = null, livre_abriu = null,
      salario = null, salario_mercado = coalesce(v_j.salario_mercado, v_j.salario), contrato_ate = null,
      protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null, treino = null
    where id = p_jogador;
  return v_j.nome || ' dispensado: está livre e pode ser contratado por qualquer clube.';
end $$;
revoke execute on function public.dispensar_jogador(bigint) from public, anon;
grant execute on function public.dispensar_jogador(bigint) to authenticated;
