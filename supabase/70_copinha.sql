-- Trem Soccer · Copinha: o mata-mata dos times de base.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Precisa do 61_liga_de_base.sql e do 47_copa_calendario_e_chave.sql (as datas da copa). Pode ser executado mais de uma vez.
--
-- Os 50 clubes jogam um mata-mata com o time da base (juvenis, profissionais formados no clube de até 21 anos e garotos da escolinha),
-- nas mesmas seis datas da Copa do Brasil: preliminar com 36 clubes sorteados (os outros 14 entram direto na fase de 32) e mais cinco fases,
-- todas com sorteio livre. Empate vai direto aos pênaltis. O campeão recebe 200 mil e o vice 100 mil, do fundo da liga, logo depois da final.
-- As partidas ficam na tabela da liga de base (fase 'copinha', grupo 'COPINHA'); a função "rodada" joga, e o banco sorteia a fase seguinte.
-- ponytail: a chave supõe de 33 a 64 clubes na liga (uma preliminar e depois 32); fora disso a Copinha não é montada.

alter table public.base_jogos add column if not exists fase text;         -- vazio: liga de base; 'copinha': mata-mata
alter table public.base_jogos add column if not exists copinha_fase int;  -- 1 (preliminar) a 6 (final)
alter table public.base_jogos add column if not exists vencedor bigint;   -- quem passou (só na Copinha)

-- Sorteia a preliminar. Uso interno: quem chama é gerar_liga_de_base, depois de o calendário (e as datas da copa) existir.
create or replace function public.montar_copinha(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_ids bigint[]; n int; v_prel int; k int; v_ini timestamptz;
begin
  select * into v_l from ligas where id = p_liga;
  if v_l.copa is null or jsonb_typeof(v_l.copa->'datas') is distinct from 'array' then return 0; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha') then return 0; end if;
  select array_agg(id order by random()) into v_ids from clubes where liga_id = p_liga;
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
revoke execute on function public.montar_copinha(bigint) from public, anon, authenticated;

-- Com a fase toda jogada, sorteia a seguinte; depois da final, registra o campeão e paga os prêmios. A função "rodada" chama.
create or replace function public.copinha_avancar(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_f int; v_ids bigint[]; n int; k int; v_ini timestamptz; v_fim record;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  perform pg_advisory_xact_lock(7070, p_liga::int); -- duas chamadas juntas não sorteiam a mesma fase duas vezes
  select * into v_l from ligas where id = p_liga;
  select max(copinha_fase) into v_f from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha';
  if v_f is null then return ''; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha' and copinha_fase = v_f and (not processada or vencedor is null)) then return ''; end if;
  if v_f >= 6 then
    select vencedor, case when vencedor = casa then fora else casa end as vice into v_fim
      from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha' and copinha_fase = v_f limit 1;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_l.temporada, 'COPINHA', v_fim.vencedor) on conflict do nothing;
    if not found then return ''; end if;
    update financas set caixa = caixa + 200 where clube_id = v_fim.vencedor;
    update financas set caixa = caixa + 100 where clube_id = v_fim.vice;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_fim.vencedor, v_l.temporada, null, 'merito', 200, 'Fundo da liga: título da Copinha'),
      (v_fim.vice, v_l.temporada, null, 'merito', 100, 'Fundo da liga: vice da Copinha');
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - 300 where id = p_liga;
    perform set_config('trem.fundo', '', true);
    return 'Copinha encerrada.';
  end if;
  select array_agg(x order by random()) into v_ids from (
    select vencedor as x from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha' and copinha_fase = v_f
    union all
    select (e.value)::bigint from jsonb_array_elements_text(coalesce(v_l.copa->'copinha_diretos', '[]'::jsonb)) e where v_f = 1) t;
  n := coalesce(array_length(v_ids, 1), 0);
  if n < 2 then return ''; end if;
  v_ini := greatest(coalesce((v_l.copa->'datas'->v_f->>'inicio')::timestamptz, now()), now());
  for k in 1..(n / 2) loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase)
      values (p_liga, v_l.temporada, 'COPINHA', 101 + v_f, v_ids[2 * k - 1], v_ids[2 * k], v_ini, 'copinha', v_f + 1);
  end loop;
  return 'Copinha: fase ' || (v_f + 1) || ' sorteada.';
end $$;
revoke execute on function public.copinha_avancar(bigint) from public, anon, authenticated;
grant execute on function public.copinha_avancar(bigint) to service_role;

-- O administrador gera a liga de base e, junto, a Copinha.
create or replace function public.gerar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador gera a liga de base.'; end if;
  n := montar_liga_de_base(p_liga);
  perform montar_copinha(p_liga);
  return n;
end $$;
revoke execute on function public.gerar_liga_de_base(bigint) from public, anon;
grant execute on function public.gerar_liga_de_base(bigint) to authenticated;

-- O título da liga de base não conta os jogos da Copinha.
create or replace function public.premiar_liga_de_base(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_temp int; g record; v_c bigint; n int := 0; v_premio int := 200;
begin
  if not public.eh_admin() then raise exception 'Só o administrador premia a liga de base.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  for g in select grupo from base_jogos where liga_id = p_liga and temporada = v_temp and fase is distinct from 'copinha' group by grupo having bool_and(processada) loop
    continue when exists (select 1 from base_campeoes where liga_id = p_liga and temporada = v_temp and grupo = g.grupo);
    select t.clube into v_c from (
      select x.clube, sum(case when x.gp > x.gc then 3 when x.gp = x.gc then 1 else 0 end) as pts, sum(x.gp - x.gc) as saldo, sum(x.gp) as gp
        from (select casa as clube, gols_casa as gp, gols_fora as gc from base_jogos where liga_id = p_liga and temporada = v_temp and fase is distinct from 'copinha' and grupo = g.grupo
              union all select fora, gols_fora, gols_casa from base_jogos where liga_id = p_liga and temporada = v_temp and fase is distinct from 'copinha' and grupo = g.grupo) x
        group by x.clube order by 2 desc, 3 desc, 4 desc, 1 limit 1) t;
    continue when v_c is null;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_temp, g.grupo, v_c);
    update financas set caixa = caixa + v_premio where clube_id = v_c;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (v_c, v_temp, null, 'merito', v_premio, 'Fundo da liga: título da liga de base');
    n := n + 1;
  end loop;
  if n > 0 then
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - n * v_premio where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return case when n = 0 then '' else n * v_premio || ' mil aos ' || n || ' campeões da liga de base.' end;
end $$;
revoke execute on function public.premiar_liga_de_base(bigint) from public, anon;
grant execute on function public.premiar_liga_de_base(bigint) to authenticated;
