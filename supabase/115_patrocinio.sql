-- Trem Soccer · patrocínio por escolha (decidido em 17/10/2026, seção "Patrocínio" do documento de projeto).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 91 (metas) e do 100 (meu_clube). Não exige republicar função.
--
-- Cada clube com dirigente escolhe uma MARCA (cosmética; as "grandes" só na Série A) e uma PROPOSTA: luvas + bônus por meta de posição.
--   segura    75% do valor em luvas, meta com ~80% de chance
--   mista     55% do valor em luvas, meta com ~55% de chance
--   agressiva 35% do valor em luvas, meta com ~40% de chance
-- O valor esperado é o mesmo nas três: luvas + chance × bônus = V (o patrocínio da divisão, +5% por temporada seguida com a mesma marca, até +20%).
-- O bônus tem teto de 1,7 V; se o teto pesar, as luvas sobem para o valor esperado continuar V.
-- A meta usa a distribuição de posições da simulação do administrador (metas.distribuicao). Quem é favorito tem a meta no 1º lugar,
-- com o bônus pela chance real. A escolha pode mudar até a 1ª rodada; nela, meta e bônus são calculados e travam.
-- As luvas entram em parcelas semanais, no lugar do patrocínio fixo (lancar_rodada). O bônus é pago na virada (pagar_patrocinio).
-- Clubes sem dirigente (bots) seguem com o patrocínio fixo da divisão.

alter table public.metas add column if not exists distribuicao jsonb;   -- chance de terminar em cada posição: [p1, p2, ...]

create table if not exists public.patrocinios (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  clube_id bigint not null references public.clubes on delete cascade,
  marca text not null,
  proposta text not null check (proposta in ('segura', 'mista', 'agressiva')),
  fidelidade smallint not null default 0,
  base int not null,            -- V da temporada, já com a fidelidade
  luvas int not null,
  bonus int,
  meta smallint,                -- terminar nessa posição ou acima
  chance numeric,
  travado boolean not null default false,
  bonus_pago int,               -- 0 se a meta não foi cumprida
  primary key (liga_id, temporada, clube_id)
);
alter table public.patrocinios enable row level security;
drop policy if exists patrocinios_leitura on public.patrocinios;
create policy patrocinios_leitura on public.patrocinios for select using (true);

create or replace function public.marca_nome(p_marca text) returns text language sql immutable as $$
  select (jsonb_build_object('grupo_trem', 'Grupo Trem', 'dobet', 'DObet', 'central_do_dobr', 'Central do DO-BR', 'central_do_mercado', 'Central do Mercado',
    'gazeta_dugoutense', 'Gazeta Dugoutense', 'podcast_10min', 'Podcast 10 min de Dugout Online', 'dugout_dos_crias', 'Dugout dos Crias',
    'mestres_do_dugout', 'Mestres do Dugout')) ->> p_marca
$$;

-- fração de luvas e chance-alvo de cada proposta
create or replace function public.parametros_patrocinio(p_proposta text, out luvas numeric, out alvo numeric) language sql immutable as $$
  select case p_proposta when 'segura' then 0.75 when 'mista' then 0.55 else 0.35 end,
         case p_proposta when 'segura' then 0.80 when 'mista' then 0.55 else 0.40 end
$$;

create or replace function public.fidelidade_patrocinio(p_clube bigint, p_temporada int, p_marca text) returns int
language plpgsql stable security definer set search_path = public as $$
declare n int := 0;
begin
  while n < 4 and exists (select 1 from patrocinios where clube_id = p_clube and temporada = p_temporada - 1 - n and marca = p_marca) loop n := n + 1; end loop;
  return n;
end $$;

-- a meta mais perto da chance-alvo (favorito: cai no 1º lugar, com a chance real) e o bônus que mantém o valor esperado em V
create or replace function public.calcular_proposta(p_dist jsonb, p_base int, p_proposta text) returns jsonb
language plpgsql immutable as $$
declare v_luvas numeric; v_alvo numeric; cum numeric := 0; best int := 1; bestp numeric := 0; bestd numeric := 9; k int; p numeric; v_bonus numeric;
begin
  select pp.luvas, pp.alvo into v_luvas, v_alvo from parametros_patrocinio(p_proposta) pp;
  for k in 1..jsonb_array_length(p_dist) loop
    cum := cum + (p_dist ->> (k - 1))::numeric;
    if abs(cum - v_alvo) < bestd then bestd := abs(cum - v_alvo); best := k; bestp := cum; end if;
  end loop;
  bestp := greatest(bestp, 0.05);
  v_bonus := least(1.7 * p_base, (1 - v_luvas) * p_base / bestp);
  return jsonb_build_object('meta', best, 'chance', round(bestp, 4), 'bonus', round(v_bonus), 'luvas', p_base - round(bestp * v_bonus));
end $$;

create or replace function public.base_patrocinio(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(d.receita_patrocinio, l.receita_patrocinio) from clubes c join ligas l on l.id = c.liga_id
    left join divisoes d on d.liga_id = c.liga_id and d.divisao = c.divisao where c.id = p_clube
$$;

-- o dirigente escolhe (ou troca, até a 1ª rodada) a marca e a proposta do seu clube
create or replace function public.escolher_patrocinio(p_marca text, p_proposta text) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_l ligas%rowtype; v_fid int; v_base int; v_sh numeric;
begin
  select * into v_c from clubes where id = public.meu_clube();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if public.marca_nome(p_marca) is null then raise exception 'Marca desconhecida.'; end if;
  if p_proposta not in ('segura', 'mista', 'agressiva') then raise exception 'Proposta desconhecida.'; end if;
  if p_marca in ('grupo_trem', 'dobet', 'central_do_dobr') and v_c.divisao <> 1 then raise exception 'Essa marca só patrocina a Série A.'; end if;
  if exists (select 1 from patrocinios where clube_id = v_c.id and temporada = v_l.temporada and travado)
     or exists (select 1 from lancamentos where clube_id = v_c.id and temporada = v_l.temporada and tipo = 'patrocinio') then
    raise exception 'A escolha travou na 1ª rodada.'; end if;
  v_fid := fidelidade_patrocinio(v_c.id, v_l.temporada, p_marca);
  v_base := round(base_patrocinio(v_c.id) * (1 + 0.05 * v_fid));
  select pp.luvas into v_sh from parametros_patrocinio(p_proposta) pp;
  insert into patrocinios (liga_id, temporada, clube_id, marca, proposta, fidelidade, base, luvas, bonus, meta, chance)
    values (v_c.liga_id, v_l.temporada, v_c.id, p_marca, p_proposta, v_fid, v_base, round(v_base * v_sh), null, null, null)
    on conflict (liga_id, temporada, clube_id) do update set marca = excluded.marca, proposta = excluded.proposta, fidelidade = excluded.fidelidade,
      base = excluded.base, luvas = excluded.luvas, bonus = null, meta = null, chance = null;
  return 'Patrocínio escolhido: ' || marca_nome(p_marca) || ', proposta ' || p_proposta || '.';
end $$;
revoke execute on function public.escolher_patrocinio(text, text) from public, anon;
grant execute on function public.escolher_patrocinio(text, text) to authenticated;

-- o que a tela mostra: a escolha atual e as 3 propostas (só as de meta distinta; com meta estimada se a simulação já rodou)
create or replace function public.propostas_patrocinio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_c clubes%rowtype; v_l ligas%rowtype; v_row patrocinios%rowtype; v_dist jsonb; v_marca text; v_fid int; v_base int; v_out jsonb := '[]'; v_last int; pr text; x jsonb; v_sh numeric;
begin
  select * into v_c from clubes where id = public.meu_clube();
  if v_c.id is null then return null; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  select * into v_row from patrocinios where clube_id = v_c.id and temporada = v_l.temporada;
  select distribuicao into v_dist from metas where clube_id = v_c.id and temporada = v_l.temporada;
  v_marca := coalesce(v_row.marca, (select marca from patrocinios where clube_id = v_c.id order by temporada desc limit 1));
  v_fid := coalesce(v_row.fidelidade, case when v_marca is null then 0 else fidelidade_patrocinio(v_c.id, v_l.temporada, v_marca) end);
  v_base := coalesce(v_row.base, base_patrocinio(v_c.id));
  foreach pr in array array['segura', 'mista', 'agressiva'] loop
    select pp.luvas into v_sh from parametros_patrocinio(pr) pp;
    x := jsonb_build_object('id', pr, 'luvas', round(v_base * v_sh));
    if v_dist is not null then
      x := x || calcular_proposta(v_dist, v_base, pr);
      if v_last = (x ->> 'meta')::int and v_row.proposta is distinct from pr then continue; end if;
      v_last := (x ->> 'meta')::int;
    end if;
    v_out := v_out || x;
  end loop;
  return jsonb_build_object('temporada', v_l.temporada, 'divisao', v_c.divisao, 'base', v_base, 'fidelidade', v_fid, 'marca', v_marca,
    'escolha', case when v_row.clube_id is null then null else to_jsonb(v_row) end, 'propostas', v_out);
end $$;
revoke execute on function public.propostas_patrocinio() from public, anon;
grant execute on function public.propostas_patrocinio() to authenticated;

-- usada por lancar_rodada: trava a escolha na 1ª rodada (a padrão é a segura, com a marca do ano passado) e devolve a parcela semanal das luvas.
-- Devolve null para clube sem dirigente: vale o patrocínio fixo da divisão.
create or replace function public.patrocinio_semanal(p_clube bigint, p_temporada int, p_rodadas int) returns int
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; r patrocinios%rowtype; v_dist jsonb; v_prop jsonb; v_marca text; v_fid int; v_base int; v_sh numeric;
begin
  select * into v_c from clubes where id = p_clube;
  if v_c.dono is null then return null; end if;
  select * into r from patrocinios where clube_id = p_clube and temporada = p_temporada;
  if r.clube_id is null then
    v_marca := coalesce((select marca from patrocinios where clube_id = p_clube and temporada < p_temporada order by temporada desc limit 1),
      case when v_c.divisao = 1 then 'grupo_trem' else 'gazeta_dugoutense' end);
    if v_c.divisao <> 1 and v_marca in ('grupo_trem', 'dobet', 'central_do_dobr') then v_marca := 'gazeta_dugoutense'; end if;
    v_fid := fidelidade_patrocinio(p_clube, p_temporada, v_marca);
    v_base := round(base_patrocinio(p_clube) * (1 + 0.05 * v_fid));
    insert into patrocinios (liga_id, temporada, clube_id, marca, proposta, fidelidade, base, luvas)
      values (v_c.liga_id, p_temporada, p_clube, v_marca, 'segura', v_fid, v_base, round(v_base * 0.75)) returning * into r;
  end if;
  if not r.travado then
    select distribuicao into v_dist from metas where clube_id = p_clube and temporada = p_temporada;
    if v_dist is not null then
      v_prop := calcular_proposta(v_dist, r.base, r.proposta);
      update patrocinios set meta = (v_prop ->> 'meta')::int, chance = (v_prop ->> 'chance')::numeric, bonus = (v_prop ->> 'bonus')::int,
        luvas = (v_prop ->> 'luvas')::int, travado = true where clube_id = p_clube and temporada = p_temporada returning * into r;
    else
      -- sem simulação: só luvas, sem bônus (nada a cobrar do clube)
      select pp.luvas into v_sh from parametros_patrocinio(r.proposta) pp;
      update patrocinios set luvas = r.base, bonus = 0, travado = true where clube_id = p_clube and temporada = p_temporada returning * into r;
    end if;
  end if;
  return round(r.luvas::numeric / p_rodadas);
end $$;
revoke execute on function public.patrocinio_semanal(bigint, int, int) from public, anon, authenticated;
grant execute on function public.patrocinio_semanal(bigint, int, int) to service_role;

create or replace function public.rotulo_patrocinio(p_clube bigint, p_temporada int) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select 'Luvas ' || marca_nome(marca) || ' (parcela)' from patrocinios where clube_id = p_clube and temporada = p_temporada), 'Patrocínio')
$$;
revoke execute on function public.rotulo_patrocinio(bigint, int) from public, anon, authenticated;
grant execute on function public.rotulo_patrocinio(bigint, int) to service_role;

-- virada: paga o bônus de quem cumpriu a meta. p_lista = [{clube_id, posicao}] (posição final na liga). Uma vez por clube.
create or replace function public.pagar_patrocinio(p_liga bigint, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_t int; r record; v_pago int; v_n int := 0; v_total int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador paga o bônus de patrocínio.'; end if;
  select temporada into v_t from ligas where id = p_liga for update;
  for r in select p.clube_id, p.meta, p.bonus, x.posicao from patrocinios p
      join jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, posicao int) on x.clube_id = p.clube_id
      where p.liga_id = p_liga and p.temporada = v_t and p.travado and p.bonus_pago is null loop
    v_pago := case when r.posicao <= r.meta then coalesce(r.bonus, 0) else 0 end;
    update patrocinios set bonus_pago = v_pago where liga_id = p_liga and temporada = v_t and clube_id = r.clube_id;
    if v_pago > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.clube_id, v_t, null, 'patrocinio', v_pago, 'Bônus de patrocínio: meta de terminar em ' || r.meta || 'º cumprida');
      update financas set caixa = caixa + v_pago where clube_id = r.clube_id;
      v_total := v_total + v_pago; v_n := v_n + 1;
    end if;
  end loop;
  return format('Bônus de patrocínio pagos a %s clubes (%s mil).', v_n, v_total);
end $$;
revoke execute on function public.pagar_patrocinio(bigint, jsonb) from public, anon;
grant execute on function public.pagar_patrocinio(bigint, jsonb) to authenticated;

-- definir_metas passa a guardar a distribuição de posições (a lista traz "distribuicao")
create or replace function public.definir_metas(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador define as metas.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  insert into metas (liga_id, temporada, clube_id, grupo, faixa_min, faixa_max, distribuicao)
    select p_liga, v_t, x.clube_id, x.grupo, x.faixa_min, x.faixa_max, x.distribuicao
      from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, grupo text, faixa_min int, faixa_max int, distribuicao jsonb)
        join clubes c on c.id = x.clube_id and c.liga_id = p_liga
    on conflict (liga_id, temporada, clube_id) do update set grupo = excluded.grupo, faixa_min = excluded.faixa_min, faixa_max = excluded.faixa_max,
      distribuicao = excluded.distribuicao;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.definir_metas(bigint, jsonb) from public, anon;
grant execute on function public.definir_metas(bigint, jsonb) to authenticated;

-- lancar_rodada e zerar_confianca ganham uma linha cada, sem copiar o corpo (a versão no ar, a do 81, segue valendo)
do $$
declare d text; antigo text;
begin
  select pg_get_functiondef('public.lancar_rodada(bigint)'::regprocedure) into d;
  if d not like '%patrocinio_semanal%' then
    antigo := d;
    d := replace(d, 'v_total := v_tv + v_pat - v_folha - v_manut;',
      'v_pat := coalesce(public.patrocinio_semanal(v_clube, v_l.temporada, v_l.rodadas_por_temporada), round(v_d.receita_patrocinio::numeric / v_l.rodadas_por_temporada));
      v_total := v_tv + v_pat - v_folha - v_manut;');
    d := replace(d, '''patrocinio'', v_pat, ''Patrocínio''', '''patrocinio'', v_pat, public.rotulo_patrocinio(v_clube, v_l.temporada)');
    if d = antigo or d not like '%rotulo_patrocinio%' then raise exception 'lancar_rodada não tem o trecho esperado: conferir antes de seguir.'; end if;
    execute d;
  end if;
  select pg_get_functiondef('public.zerar_confianca(bigint)'::regprocedure) into d;
  if d not like '%patrocinios%' then
    d := replace(d, 'delete from metas where liga_id = p_liga;', 'delete from metas where liga_id = p_liga; delete from patrocinios where liga_id = p_liga;');
    execute d;
  end if;
end $$;
