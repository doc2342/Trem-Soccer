-- Raio-x da economia por grupo: caixa, folha, resultado operacional, prêmio, saldo e quantos clubes vão ao vermelho.
-- Grava sozinho a temporada que acabou, no momento da virada (gatilho em ligas.temporada), em economia_temporadas.
-- No admin: quadro "Economia por temporada" (temporadas guardadas e a atual, parcial). Pode rodar mais de uma vez.

-- receitas e custos do dia a dia: o resto (venda, compra, obra, copa, prêmio, imposto...) fica fora do "operacional"
create or replace function public.economia_interna(p_liga bigint, p_temporada int)
returns table (grupo text, clubes int, dirigentes int, caixa_media int, caixa_min int, caixa_max int, folha_media int,
  operacional int, premio int, saldo int, no_vermelho int, vermelho_em_2 int, por_tipo jsonb)
language sql stable security definer set search_path = public as $$
  with c as (
    select c.id, coalesce(h.grupo, c.grupo) as grupo, c.dono is not null as dir, f.caixa,
      (select coalesce(sum(j.salario), 0) from jogadores j where j.clube_id = c.id) as folha
    from clubes c join financas f on f.clube_id = c.id
    left join historico h on h.liga_id = c.liga_id and h.temporada = p_temporada and h.clube_id = c.id
    where c.liga_id = p_liga),
  m as (select l.clube_id, l.tipo, sum(l.valor)::bigint as v from lancamentos l join c on c.id = l.clube_id where l.temporada = p_temporada group by 1, 2),
  s as (select c.*,
      coalesce((select sum(v) from m where m.clube_id = c.id), 0) as saldo,
      coalesce((select sum(v) from m where m.clube_id = c.id and m.tipo in ('tv', 'patrocinio', 'bilheteria', 'carne', 'comida', 'salarios', 'manutencao', 'treinadores')), 0) as oper,
      coalesce((select sum(v) from m where m.clube_id = c.id and m.tipo = 'premio'), 0) as premio
    from c),
  g as (select s.grupo, count(*)::int n, count(*) filter (where dir)::int d, avg(caixa)::int cm, min(caixa)::int cmin, max(caixa)::int cmax, avg(folha)::int fm,
      avg(oper)::int op, avg(premio)::int pr, avg(saldo)::int sd, count(*) filter (where caixa < 0)::int nv,
      count(*) filter (where caixa >= 0 and saldo < 0 and caixa < -2 * saldo)::int v2
    from s group by s.grupo)
  select g.grupo, g.n, g.d, g.cm, g.cmin, g.cmax, g.fm, g.op, g.pr, g.sd, g.nv, g.v2,
    (select jsonb_object_agg(x.tipo, round(x.tot::numeric / g.n)) from (select m.tipo, sum(m.v) tot from m join c on c.id = m.clube_id where c.grupo = g.grupo group by m.tipo) x)
  from g order by g.grupo;
$$;
revoke execute on function public.economia_interna(bigint, int) from public, anon, authenticated;

-- a mesma consulta para o admin, a qualquer momento (a temporada em andamento sai parcial: sem prêmio e imposto)
create or replace function public.economia_da_temporada(p_liga bigint, p_temporada int)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(e) from economia_interna(p_liga, p_temporada) e where public.eh_admin();
$$;
revoke execute on function public.economia_da_temporada(bigint, int) from public, anon;
grant execute on function public.economia_da_temporada(bigint, int) to authenticated;

create table if not exists public.economia_temporadas (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  grupo text not null,
  dados jsonb not null,
  criado_em timestamptz not null default now(),
  primary key (liga_id, temporada, grupo)
);
alter table public.economia_temporadas enable row level security;
drop policy if exists economia_temporadas_admin on public.economia_temporadas;
create policy economia_temporadas_admin on public.economia_temporadas for select to authenticated using (public.eh_admin());

create or replace function public.guardar_economia(p_liga bigint, p_temporada int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into economia_temporadas (liga_id, temporada, grupo, dados)
    select p_liga, p_temporada, e.grupo, to_jsonb(e) - 'grupo' from economia_interna(p_liga, p_temporada) e
  on conflict (liga_id, temporada, grupo) do update set dados = excluded.dados, criado_em = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.guardar_economia(bigint, int) from public, anon, authenticated;

-- na virada, a temporada sobe depois de prêmio, imposto e fundo: é a hora de guardar a que acabou, já completa
create or replace function public.economia_na_virada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.temporada = old.temporada + 1 then perform guardar_economia(new.id, old.temporada); end if;
  return new;
end $$;
drop trigger if exists ligas_economia on public.ligas;
create trigger ligas_economia after update of temporada on public.ligas for each row execute function public.economia_na_virada();
