-- 80: virada de temporada com outros países (passo 2 de 4). Rodar depois do 79. Não exige republicar funções.
-- A virada em si é montada na tela do administrador (src/virada.js): o campeonato de outro país não tem acesso nem descenso, os jovens
-- chegam pela régua do país e cada país sorteia a própria safra. Aqui fica o que é do banco:
--   1. teto de folha de 24 mi para clube de outro país (o mesmo de REGUA_DE_FORA em src/virada.js);
--   2. Copinha e liga de base só com os clubes do Brasil (com 90 clubes a Copinha nem era montada: a chave vai de 33 a 64);
--   3. prêmios individuais dos campeonatos de fora são só de honra: não saem do fundo da liga.

create or replace function public.teto_do_clube(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select case when c.pais <> 'Brasil' then 24000 else coalesce((select d.teto_folha from divisoes d
      where d.liga_id = c.liga_id and d.divisao = case when c.paraquedas = l.temporada then greatest(1, c.divisao - 1) else c.divisao end),
    l.teto_folha) end
  from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube
$$;

create or replace function public.montar_copinha(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_ids bigint[]; n int; v_prel int; k int; v_ini timestamptz;
begin
  select * into v_l from ligas where id = p_liga;
  if v_l.copa is null or jsonb_typeof(v_l.copa->'datas') is distinct from 'array' then return 0; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha') then return 0; end if;
  select array_agg(id order by random()) into v_ids from clubes where liga_id = p_liga and pais = 'Brasil';
  n := coalesce(array_length(v_ids, 1), 0);
  if n < 33 or n > 64 then return 0; end if;
  v_prel := n - 32;
  v_ini := greatest((v_l.copa->'datas'->0->>'inicio')::timestamptz, now());
  for k in 1..v_prel loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase)
      values (p_liga, v_l.temporada, 'COPINHA', 101, v_ids[2 * k - 1], v_ids[2 * k], v_ini, 'copinha', 1);
  end loop;
  update ligas set copa = jsonb_set(copa, '{copinha_diretos}', to_jsonb(v_ids[2 * v_prel + 1 : n])) where id = p_liga;
  return v_prel;
end $$;

create or replace function public.montar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; v_turno int; n int;
begin
  select temporada into v_temp from ligas where id = p_liga;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_temp and processada) then return 0; end if;
  delete from base_jogos where liga_id = p_liga and temporada = v_temp;
  select max(rodada) / 2 into v_turno from partidas where liga_id = p_liga and fase = 'liga';
  if coalesce(v_turno, 0) < 1 then return 0; end if;
  insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio)
    select p.liga_id, v_temp, p.grupo, p.rodada, p.casa, p.fora,
        coalesce((select min(q.inicio) from partidas q where q.liga_id = p.liga_id and q.grupo = p.grupo and q.fase = 'liga' and q.rodada = p.rodada * 2), p.inicio)
      from partidas p where p.liga_id = p_liga and p.fase = 'liga' and p.rodada <= v_turno and public.pais_do_grupo(p.grupo) = 'Brasil';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.premiar_temporada(p_liga bigint, p_merito jsonb default '[]'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t int; v_g text; v_div int; v_valor int; d jsonb; x jsonb; r record; v_min int;
  v_merito int := 0; v_ind int := 0; v_n int := 0;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga for update;
  if v_t is null then return ''; end if;

  -- a) mérito
  if not exists (select 1 from lancamentos l join clubes c on c.id = l.clube_id where c.liga_id = p_liga and l.temporada = v_t and l.tipo = 'merito') then
    for r in select * from jsonb_to_recordset(coalesce(p_merito, '[]'::jsonb)) as m(clube_id bigint, valor int, descricao text) loop
      if r.valor > 0 and exists (select 1 from clubes where id = r.clube_id and liga_id = p_liga) then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'merito', r.valor, coalesce(r.descricao, 'Bônus de mérito'));
        update financas set caixa = caixa + r.valor where clube_id = r.clube_id;
        v_merito := v_merito + r.valor;
      end if;
    end loop;
    if v_merito > 0 then
      perform set_config('trem.fundo', 'merito', true);
      update ligas set fundo_taca = fundo_taca - v_merito where id = p_liga;
      perform set_config('trem.fundo', '', true);
    end if;
  end if;

  -- b) prêmios individuais
  if not exists (select 1 from premios_individuais where liga_id = p_liga and temporada = v_t) then
    for v_g in select distinct grupo from partidas where liga_id = p_liga and fase = 'liga' order by 1 loop
      v_div := coalesce((select min(divisao) from clubes where liga_id = p_liga and grupo = v_g), 2);
      v_valor := (case v_div when 1 then 100 when 2 then 60 else 40 end);
      if public.pais_do_grupo(v_g) <> 'Brasil' then v_valor := 0; end if; -- em outro país o prêmio é só de honra
      d := estatisticas_da_liga(p_liga, v_g);
      v_min := coalesce((d->>'minimo')::int, 3);
      x := d->'artilheiros'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'artilheiro', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'gols')::numeric) on conflict do nothing; end if;
      x := d->'assistencias'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'garcom', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'ass')::numeric) on conflict do nothing; end if;
      x := d->'notas'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'melhor', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, (case when v_div = 1 and v_valor > 0 then 200 else v_valor end), (x->>'nota')::numeric) on conflict do nothing; end if;
      x := d->'goleiros'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'goleiro', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'sem')::numeric) on conflict do nothing; end if;
      x := melhor_nota(p_liga, v_g, 21, null, v_min);
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'revelacao', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'nota')::numeric) on conflict do nothing; end if;
    end loop;
    if exists (select 1 from partidas where liga_id = p_liga and fase = 'copa') then
      x := estatisticas_da_liga(p_liga, 'COPA')->'artilheiros'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, 'COPA', 'artilheiro', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, 100, (x->>'gols')::numeric) on conflict do nothing; end if;
      x := coalesce(melhor_nota(p_liga, 'COPA', null, 4, 2), melhor_nota(p_liga, 'COPA', null, 4, 1));
      if x is not null then insert into premios_individuais values (p_liga, v_t, 'COPA', 'craque', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, 100, (x->>'nota')::numeric) on conflict do nothing; end if;
    end if;
    for r in select * from premios_individuais where liga_id = p_liga and temporada = v_t and clube_id is not null and valor > 0 loop
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'premio_individual', r.valor,
        'Prêmio individual: ' || r.jogador || ' (' || (case r.premio when 'artilheiro' then 'artilheiro' when 'garcom' then 'garçom' when 'melhor' then 'melhor jogador'
          when 'goleiro' then 'melhor goleiro' when 'revelacao' then 'revelação' else 'craque da copa' end) || ')');
      update financas set caixa = caixa + r.valor where clube_id = r.clube_id;
      v_ind := v_ind + r.valor; v_n := v_n + 1;
    end loop;
    if v_ind > 0 then
      perform set_config('trem.fundo', 'premios', true);
      update ligas set fundo_taca = fundo_taca - v_ind where id = p_liga;
      perform set_config('trem.fundo', '', true);
    end if;
  end if;
  return 'Fundo da liga: ' || v_merito || ' mil em bônus de mérito e ' || v_ind || ' mil em ' || v_n || ' prêmios individuais.';
end $$;
