-- Trem Soccer · mais de um clube por pessoa (passo 2 do segundo clube, desenho de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 91 (diretoria) e do 92 (clube ativo).
-- Ainda não dá para pedir um clube extra (isso é o passo 4); aqui só o banco passa a aceitar.
--
-- 1. Sai a regra "um clube por pessoa" (clubes.dono único). Entram: um clube por país, no máximo 3 por pessoa
--    e no máximo 2 no mesmo continente (o Brasil é América do Sul: hoje, na prática, 2).
-- 2. O direito a clube extra passa do clube para a pessoa (dirigentes.direitos). Quem já tinha segundo_clube leva 1 direito.
-- 3. aplicar_confianca: a pessoa ganha um direito quando TODOS os clubes dela chegam a 80 na virada sem caixa negativo,
--    se tiver menos de 3 clubes e nenhum direito sem uso. Com um clube, é a regra de antes; com dois, os dois precisam chegar.

do $$
declare v text;
begin
  select conname into v from pg_constraint
   where conrelid = 'public.clubes'::regclass and contype = 'u' and conkey = array[(select attnum from pg_attribute where attrelid = 'public.clubes'::regclass and attname = 'dono')];
  if v is not null then execute format('alter table public.clubes drop constraint %I', v); end if;
end $$;
create unique index if not exists clubes_dono_pais on public.clubes (dono, pais) where dono is not null;

-- ponytail: só existe a América do Sul; país novo de outro continente entra aqui
create or replace function public.continente_do_pais(p_pais text) returns text language sql immutable as $$
  select case when p_pais in ('Brasil', 'Argentina', 'Uruguai', 'Colômbia', 'Chile') then 'América do Sul' else p_pais end
$$;

create or replace function public.limite_de_clubes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dono is null or (tg_op = 'UPDATE' and old.dono is not distinct from new.dono) then return new; end if;
  if (select count(*) from clubes where dono = new.dono and id <> new.id) >= 3 then
    raise exception 'Essa pessoa já tem 3 clubes, o máximo.'; end if;
  if (select count(*) from clubes where dono = new.dono and id <> new.id and continente_do_pais(pais) = continente_do_pais(new.pais)) >= 2 then
    raise exception 'Essa pessoa já tem 2 clubes na %, o máximo por continente.', continente_do_pais(new.pais); end if;
  return new;
end $$;
drop trigger if exists clubes_limite on public.clubes;
create trigger clubes_limite before insert or update of dono on public.clubes for each row execute function public.limite_de_clubes();

insert into dirigentes (user_id, direitos)
  select distinct dono, 1 from clubes where segundo_clube and dono is not null
  on conflict (user_id) do update set direitos = greatest(dirigentes.direitos, 1);

create or replace function public.aplicar_confianca(p_liga bigint, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_t int; r record; v_antes int; v_depois int; v_teto int; v_verba int; v_div int; v_n int := 0; v_total int := 0; v_ok bigint[] := '{}'; v_dir int;
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
    if v_depois >= 80 and coalesce((select caixa from financas where clube_id = r.clube_id), 0) >= 0 then v_ok := v_ok || r.clube_id; end if;
    update clubes set confianca = v_depois,
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
  -- direito a clube extra: todos os clubes da pessoa no 80 sem vermelho, menos de 3 clubes, nenhum direito guardado
  insert into dirigentes (user_id, direitos)
    select c.dono, 1 from clubes c where c.liga_id = p_liga and c.dono is not null
     group by c.dono having count(*) < 3 and bool_and(c.id = any(v_ok))
  on conflict (user_id) do update set direitos = 1 where dirigentes.direitos = 0;
  get diagnostics v_dir = row_count;
  return format('Confiança da diretoria aplicada a %s clubes (verbas: %s mil; %s dirigentes ganharam direito a clube extra).', v_n, v_total, v_dir);
end $$;
revoke execute on function public.aplicar_confianca(bigint, jsonb) from public, anon;
grant execute on function public.aplicar_confianca(bigint, jsonb) to authenticated;

create or replace function public.zerar_confianca(p_liga bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  update clubes set confianca = 50, segundo_clube = false, multas_extra = 0, multas_extra_temporada = null where liga_id = p_liga;
  update dirigentes set direitos = 0, pode_pedir_desde = null where user_id in (select dono from clubes where liga_id = p_liga);
  delete from metas where liga_id = p_liga;
  delete from confianca_historico where liga_id = p_liga;
end $$;
revoke execute on function public.zerar_confianca(bigint) from public, anon;
grant execute on function public.zerar_confianca(bigint) to authenticated;
