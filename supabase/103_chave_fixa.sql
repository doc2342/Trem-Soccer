-- 103: chave fixa nos mata-matas (Copa do Brasil, Libertadores, Copinha e Libertadores Juvenil).
-- A chave inteira é sorteada quando o calendário é gerado: cada jogo ganha a posição na fase (coluna chave) e a fase seguinte
-- junta os vencedores das posições 1 e 2, 3 e 4, e assim por diante. Sem cabeças de chave; nas oitavas da Libertadores continua
-- Brasil x estrangeiro. Na Copa e na Copinha, as 32 vagas da fase de 32 (vencedores da preliminar e clubes diretos) também saem
-- no início (copa.chave32 e copa.copinha_chave32).
-- Jogos sem chave (a temporada em andamento quando este arquivo rodar) seguem com o sorteio de cada fase, como antes.
-- Não precisa republicar a função "rodada".

alter table partidas add column if not exists chave int;
alter table base_jogos add column if not exists chave int;

create or replace function public.copa_sortear(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_copa jsonb; v_fase int; v_fixa boolean; v_ids bigint[]; v_data jsonb; n int := 0; i int; a bigint; b bigint; na int; nb int;
begin
  select copa into v_copa from ligas where id = p_liga for update;
  if v_copa is null then return 0; end if;
  select max(copa_fase) into v_fase from partidas where liga_id = p_liga and fase = 'copa';
  if v_fase is null or v_fase >= 6 then return 0; end if;
  if exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase and (not processada or fim > now())) then return 0; end if;
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id
             where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase and (r.partida_id is null or r.efeitos is not null)) then return 0; end if;
  -- chave fixa: todos os jogos da fase têm posição; sem ela (temporada que começou antes do 103), sorteio como antes
  v_fixa := not exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase and chave is null);
  v_data := v_copa->'datas'->v_fase; -- índice começa em zero: a posição v_fase é a da fase seguinte
  if v_data is null then return 0; end if;
  -- ordem: na saída da preliminar, a posição de cada vaga em copa.chave32 (-k = vencedor do jogo k da preliminar; positivo = clube direto);
  -- depois, a posição do jogo de onde veio. Sem chave, a ordem é nula e vale o sorteio.
  select array_agg(x.id order by x.ordem nulls last, random()) into v_ids from (
    select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id,
        case when v_fase = 1 then (select c.o from jsonb_array_elements_text(v_copa->'chave32') with ordinality c(v, o) where c.v::bigint = -p.chave) else p.chave::bigint end as ordem
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase
    union all
    select (e.value)::bigint, (select c.o from jsonb_array_elements_text(v_copa->'chave32') with ordinality c(v, o) where c.v::bigint = (e.value)::bigint)
      from jsonb_array_elements_text(v_copa->'diretos') e where v_fase = 1
  ) x;
  if v_ids is null or array_length(v_ids, 1) < 2 then return 0; end if;
  i := 1;
  while i + 1 <= array_length(v_ids, 1) loop
    a := v_ids[i]; b := v_ids[i + 1];
    select estadio_nivel into na from clubes where id = a;
    select estadio_nivel into nb from clubes where id = b;
    if coalesce(nb, 1) > coalesce(na, 1) then a := v_ids[i + 1]; b := v_ids[i]; end if; -- joga no estádio maior; iguais, vale a ordem do sorteio
    insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, chave)
      values (p_liga, 'COPA', 100 + v_fase + 1, 'copa', v_fase + 1, a, b, (v_data->>'inicio')::timestamptz, (v_data->>'fim')::timestamptz, case when v_fixa then (i + 1) / 2 end);
    n := n + 1; i := i + 2;
  end loop;
  return n;
end $$;

create or replace function public.lib_avancar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_fase int; v_fixa boolean; v_ids bigint[]; v_data jsonb; n int := 0; i int; a bigint; b bigint; na int; nb int;
  v_valor int; v_total int := 0; v_vice bigint;
  c_entrada int[] := array[0, 0, 0, 200, 300, 0]; -- ao entrar na fase 4 (quartas) e 5 (semifinal)
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.copa is null or v_l.copa->'lib' is null or v_l.copa->'lib' ? 'campeao' then return 0; end if;
  select max(copa_fase) into v_fase from partidas where liga_id = p_liga and fase = 'lib';
  if v_fase is null then return 0; end if;
  if exists (select 1 from partidas where liga_id = p_liga and fase = 'lib' and copa_fase = v_fase and (not processada or fim > now())) then return 0; end if;
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id
             where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = v_fase and (r.partida_id is null or r.efeitos is not null)) then return 0; end if;
  v_fixa := not exists (select 1 from partidas where liga_id = p_liga and fase = 'lib' and copa_fase = v_fase and chave is null);
  select array_agg(x.id order by x.ordem nulls last, random()) into v_ids from (
    select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id, p.chave as ordem
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = v_fase) x;
  if v_ids is null then return 0; end if;
  if v_fase >= 6 then
    -- final jogada: campeão e vice
    select case when p.casa = v_ids[1] then p.fora else p.casa end into v_vice from partidas p where p.liga_id = p_liga and p.fase = 'lib' and p.copa_fase = 6 limit 1;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_ids[1], v_l.temporada, 206, 'copa', 2500, 'Libertadores: prêmio de campeão'),
      (v_vice, v_l.temporada, 206, 'copa', 700, 'Libertadores: prêmio de vice-campeão');
    update financas set caixa = caixa + 2500 where clube_id = v_ids[1];
    update financas set caixa = caixa + 700 where clube_id = v_vice;
    v_total := 3200;
    v_l.copa := jsonb_set(v_l.copa, '{lib,campeao}', to_jsonb(v_ids[1]));
  else
    v_data := v_l.copa->'lib'->'datas'->(v_fase - 2); -- datas[0] é a das oitavas (fase 3): a posição v_fase - 2 é a da fase seguinte
    if v_data is null or array_length(v_ids, 1) < 2 then return 0; end if;
    i := 1;
    while i + 1 <= array_length(v_ids, 1) loop
      a := v_ids[i]; b := v_ids[i + 1];
      select estadio_nivel into na from clubes where id = a;
      select estadio_nivel into nb from clubes where id = b;
      if coalesce(nb, 1) > coalesce(na, 1) then a := v_ids[i + 1]; b := v_ids[i]; end if; -- joga no estádio maior; iguais, vale a ordem do sorteio
      insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim, chave)
        values (p_liga, 'LIB', 200 + v_fase + 1, 'lib', v_fase + 1, a, b, (v_data->>'inicio')::timestamptz, (v_data->>'fim')::timestamptz, case when v_fixa then (i + 1) / 2 end);
      n := n + 1; i := i + 2;
    end loop;
    v_valor := c_entrada[v_fase + 1];
    if v_valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        select x, v_l.temporada, 200 + v_fase + 1, 'copa', v_valor, 'Libertadores: prêmio por chegar ' || case when v_fase + 1 = 4 then 'às quartas' else 'à semifinal' end
          from unnest(v_ids) x;
      update financas set caixa = caixa + v_valor where clube_id = any(v_ids);
      v_total := v_valor * array_length(v_ids, 1);
    end if;
  end if;
  if v_total > 0 then
    -- ponytail: o fundo paga mesmo sem saldo (fica negativo). São 6 mi por temporada contra uma sobra de ~6–7 mi;
    -- se um dia faltar, copiar de copa_premiar a espera pelo saldo.
    perform set_config('trem.fundo', 'lib', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) - v_total, copa = v_l.copa where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return n;
end $$;

create or replace function public.montar_copinha(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_ids bigint[]; n int; v_prel int; k int; v_ini timestamptz; v_vagas jsonb;
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
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase, chave)
      values (p_liga, v_l.temporada, 'COPINHA', 101, v_ids[2 * k - 1], v_ids[2 * k], v_ini, 'copinha', 1, k);
  end loop;
  -- as 32 vagas da fase de 32, sorteadas agora: -k = vencedor do jogo k da preliminar; positivo = clube que entra direto
  select jsonb_agg(v order by random()) into v_vagas from (select -g::bigint as v from generate_series(1, v_prel) g union all select unnest(v_ids[2 * v_prel + 1 : n])) t;
  update ligas set copa = jsonb_set(jsonb_set(copa, '{copinha_diretos}', to_jsonb(v_ids[2 * v_prel + 1 : n])), '{copinha_chave32}', v_vagas) where id = p_liga;
  return v_prel;
end $$;

create or replace function public.copinha_avancar(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_f int; v_fixa boolean; v_ids bigint[]; n int; k int; v_ini timestamptz; v_fim record;
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
  v_fixa := not exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha' and copinha_fase = v_f and chave is null);
  select array_agg(x order by ordem nulls last, random()) into v_ids from (
    select vencedor as x, case when v_f = 1 then (select c.o from jsonb_array_elements_text(v_l.copa->'copinha_chave32') with ordinality c(v, o) where c.v::bigint = -chave) else chave::bigint end as ordem
      from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'copinha' and copinha_fase = v_f
    union all
    select (e.value)::bigint, (select c.o from jsonb_array_elements_text(v_l.copa->'copinha_chave32') with ordinality c(v, o) where c.v::bigint = (e.value)::bigint)
      from jsonb_array_elements_text(coalesce(v_l.copa->'copinha_diretos', '[]'::jsonb)) e where v_f = 1) t;
  n := coalesce(array_length(v_ids, 1), 0);
  if n < 2 then return ''; end if;
  v_ini := greatest(coalesce((v_l.copa->'datas'->v_f->>'inicio')::timestamptz, now()), now());
  for k in 1..(n / 2) loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase, chave)
      values (p_liga, v_l.temporada, 'COPINHA', 101 + v_f, v_ids[2 * k - 1], v_ids[2 * k], v_ini, 'copinha', v_f + 1, case when v_fixa then k end);
  end loop;
  return 'Copinha: fase ' || (v_f + 1) || case when v_fixa then ' montada pela chave.' else ' sorteada.' end;
end $$;

create or replace function public.libertadores_juvenil_avancar(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_f int; v_fixa boolean; v_ids bigint[]; n int; k int; v_ini timestamptz; v_fim record;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  perform pg_advisory_xact_lock(7071, p_liga::int); -- duas chamadas juntas não sorteiam a mesma fase duas vezes
  select * into v_l from ligas where id = p_liga;
  select max(copinha_fase) into v_f from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv';
  if v_f is null then return ''; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f and (not processada or vencedor is null)) then return ''; end if;
  if v_f >= 6 then
    select vencedor, case when vencedor = casa then fora else casa end as vice into v_fim
      from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f limit 1;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_l.temporada, 'LIBJUV', v_fim.vencedor) on conflict do nothing;
    if not found then return ''; end if;
    update financas set caixa = caixa + 300 where clube_id = v_fim.vencedor;
    update financas set caixa = caixa + 150 where clube_id = v_fim.vice;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_fim.vencedor, v_l.temporada, null, 'merito', 300, 'Fundo da liga: título da Libertadores Juvenil'),
      (v_fim.vice, v_l.temporada, null, 'merito', 150, 'Fundo da liga: vice da Libertadores Juvenil');
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - 450 where id = p_liga;
    perform set_config('trem.fundo', '', true);
    return 'Libertadores Juvenil encerrada.';
  end if;
  v_fixa := not exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f and chave is null);
  select array_agg(vencedor order by chave nulls last, random()) into v_ids from base_jogos
    where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv' and copinha_fase = v_f;
  n := coalesce(array_length(v_ids, 1), 0);
  if n < 2 then return ''; end if;
  v_ini := greatest(coalesce((v_l.copa->'lib'->'datas'->(v_f - 2)->>'inicio')::timestamptz, now()), now());
  for k in 1..(n / 2) loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase, chave)
      values (p_liga, v_l.temporada, 'LIBJ', 201 + v_f, v_ids[2 * k - 1], v_ids[2 * k], v_ini, 'libjuv', v_f + 1, case when v_fixa then k end);
  end loop;
  return 'Libertadores Juvenil: fase ' || (v_f + 1) || case when v_fixa then ' montada pela chave.' else ' sorteada.' end;
end $$;

-- Libertadores Juvenil: as oitavas já saem sorteadas (Brasil x estrangeiro); cada jogo guarda a posição k na chave.
do $$
declare d text := pg_get_functiondef('public.montar_libertadores_juvenil(bigint)'::regprocedure); n text;
begin
  n := replace(replace(d, 'inicio, fase, copinha_fase)', 'inicio, fase, copinha_fase, chave)'), '''libjuv'', 3);', '''libjuv'', 3, k);');
  if n = d then raise exception 'montar_libertadores_juvenil: trecho não encontrado; nada foi trocado.'; end if;
  execute n;
end $$;
