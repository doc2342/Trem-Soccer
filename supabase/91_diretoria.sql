-- Trem Soccer · diretoria e confiança (desenho fechado em 16/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Não exige republicar função. Precisa do 66/76 (compra pela multa).
--
-- 1. clubes.confianca (0–100, começa em 50), clubes.segundo_clube (liberado ao chegar a 80 numa virada sem vermelho; não se perde),
--    clubes.multas_extra / multas_extra_temporada (+1 compra pela multa na temporada seguinte a uma virada com confiança 85+).
-- 2. metas: a faixa de posições de cada clube na temporada, calculada pela página do administrador (simulações). Leitura pública.
-- 3. confianca_historico: o que cada virada fez com a confiança (antes, depois, partes da conta, verba). Leitura pública.
-- 4. definir_metas, aplicar_confianca (uma vez por temporada; paga a verba no caixa) e zerar_confianca (ao reiniciar o teste): só admin.
-- 5. comprar_pela_multa passa a aceitar o bônus: a regra "4 por temporada" vira "4 + multas_extras(clube, temporada)".

alter table public.clubes add column if not exists confianca smallint not null default 50;
alter table public.clubes add column if not exists segundo_clube boolean not null default false;
alter table public.clubes add column if not exists multas_extra smallint not null default 0;
alter table public.clubes add column if not exists multas_extra_temporada int;

create table if not exists public.metas (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  clube_id bigint not null references public.clubes on delete cascade,
  grupo text,
  faixa_min smallint not null,
  faixa_max smallint not null,
  primary key (liga_id, temporada, clube_id)
);
alter table public.metas enable row level security;
drop policy if exists metas_leitura on public.metas;
create policy metas_leitura on public.metas for select using (true);

create table if not exists public.confianca_historico (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  clube_id bigint not null references public.clubes on delete cascade,
  antes smallint not null,
  depois smallint not null,
  detalhes jsonb,
  verba int not null default 0,
  primary key (liga_id, temporada, clube_id)
);
alter table public.confianca_historico enable row level security;
drop policy if exists confianca_historico_leitura on public.confianca_historico;
create policy confianca_historico_leitura on public.confianca_historico for select using (true);

create or replace function public.definir_metas(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador define as metas.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  insert into metas (liga_id, temporada, clube_id, grupo, faixa_min, faixa_max)
    select p_liga, v_t, x.clube_id, x.grupo, x.faixa_min, x.faixa_max
      from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, grupo text, faixa_min int, faixa_max int)
        join clubes c on c.id = x.clube_id and c.liga_id = p_liga
    on conflict (liga_id, temporada, clube_id) do update set grupo = excluded.grupo, faixa_min = excluded.faixa_min, faixa_max = excluded.faixa_max;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.definir_metas(bigint, jsonb) from public, anon;
grant execute on function public.definir_metas(bigint, jsonb) to authenticated;

-- p_lista: [{clube_id, delta, detalhes}] calculado na página do administrador, logo antes da virada (a temporada ainda é a que termina).
-- Verba: 10% do teto da divisão com confiança 85+, 5% com 70+, paga no caixa. Só roda uma vez por temporada.
create or replace function public.aplicar_confianca(p_liga bigint, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_t int; r record; v_antes int; v_depois int; v_teto int; v_verba int; v_div int; v_n int := 0; v_total int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador aplica a confiança.'; end if;
  select temporada into v_t from ligas where id = p_liga for update;
  if exists (select 1 from confianca_historico where liga_id = p_liga and temporada = v_t) then return 'A confiança desta temporada já tinha sido aplicada.'; end if;
  for r in select * from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, delta int, detalhes jsonb) loop
    select confianca, divisao into v_antes, v_div from clubes where id = r.clube_id and liga_id = p_liga for update;
    if v_antes is null then continue; end if;
    v_depois := greatest(0, least(100, v_antes + greatest(-20, least(20, r.delta))));
    v_teto := coalesce((select teto_folha from divisoes where liga_id = p_liga and divisao = v_div), 14000);
    v_verba := case when v_depois >= 85 then round(v_teto * 0.10) when v_depois >= 70 then round(v_teto * 0.05) else 0 end;
    update clubes set confianca = v_depois,
        segundo_clube = segundo_clube or (v_depois >= 80 and coalesce((select caixa from financas where clube_id = r.clube_id), 0) >= 0),
        multas_extra = case when v_depois >= 85 then 1 else 0 end, multas_extra_temporada = v_t + 1
      where id = r.clube_id;
    if v_verba > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'diretoria', v_verba, 'Verba da diretoria pela confiança no trabalho');
      update financas set caixa = caixa + v_verba where clube_id = r.clube_id;
      v_total := v_total + v_verba;
    end if;
    insert into confianca_historico (liga_id, temporada, clube_id, antes, depois, detalhes, verba) values (p_liga, v_t, r.clube_id, v_antes, v_depois, r.detalhes, v_verba);
    v_n := v_n + 1;
  end loop;
  return format('Confiança da diretoria aplicada a %s clubes (verbas: %s mil).', v_n, v_total);
end $$;
revoke execute on function public.aplicar_confianca(bigint, jsonb) from public, anon;
grant execute on function public.aplicar_confianca(bigint, jsonb) to authenticated;

create or replace function public.zerar_confianca(p_liga bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  update clubes set confianca = 50, segundo_clube = false, multas_extra = 0, multas_extra_temporada = null where liga_id = p_liga;
  delete from metas where liga_id = p_liga;
  delete from confianca_historico where liga_id = p_liga;
end $$;
revoke execute on function public.zerar_confianca(bigint) from public, anon;
grant execute on function public.zerar_confianca(bigint) to authenticated;

create or replace function public.multas_extras(p_clube bigint, p_temporada int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select multas_extra from clubes where id = p_clube and multas_extra_temporada = p_temporada), 0)::int
$$;

-- compra pela multa: troca o limite fixo de 4 pelo limite com o bônus, na versão que estiver no ar (sem copiar a função inteira)
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'comprar_pela_multa' limit 1;
  if d is null then raise notice 'comprar_pela_multa não existe: nada a trocar.'; return; end if;
  if position('multas_extras' in d) > 0 then return; end if;
  if position('tipo = ''multa'') >= 4 then' in d) = 0 then raise exception 'Não achei a regra das 4 compras pela multa em comprar_pela_multa: avise o Claude.'; end if;
  d := replace(d, 'tipo = ''multa'') >= 4 then', 'tipo = ''multa'') >= 4 + public.multas_extras(v_para.id, v_l.temporada) then');
  d := replace(d, 'Você já fez as 4 compras pela multa desta temporada.', 'Você já fez todas as compras pela multa desta temporada.');
  execute d;
end $$;
