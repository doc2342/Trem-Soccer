-- Trem Soccer · fase 2, passo E2: caixa, lançamentos e extrato.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Executar ANTES de publicar de novo a função "rodada". Pode ser executado mais de uma vez sem apagar dados.
-- Valores em milhares. Enquanto o calendário de teste não segue semanas reais, o dinheiro corre por rodada de liga:
-- a cada partida calculada, o clube recebe TV e patrocínio e paga salários, na fração de uma rodada da temporada.

-- o caixa fica numa tabela à parte, que só o dono do clube e o administrador leem (a tabela de clubes é pública)
create table if not exists public.financas (
  clube_id bigint primary key references public.clubes on delete cascade,
  caixa int not null default 5000 -- caixa inicial de 5 mi
);
insert into public.financas (clube_id) select id from public.clubes on conflict do nothing;
alter table public.financas enable row level security;
drop policy if exists financas_ler on public.financas;
create policy financas_ler on public.financas for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
alter table public.ligas add column if not exists receita_tv int not null default 4500;           -- por temporada; temporada 0 usa a segunda divisão
alter table public.ligas add column if not exists receita_patrocinio int not null default 3600;   -- por temporada
alter table public.ligas add column if not exists rodadas_por_temporada int not null default 18;
alter table public.partidas add column if not exists financeiro boolean not null default false;   -- os lançamentos desta partida já foram feitos

create table if not exists public.lancamentos (
  id bigint generated always as identity primary key,
  clube_id bigint not null references public.clubes on delete cascade,
  temporada int not null,
  rodada int,
  tipo text not null,      -- tv, patrocinio, salarios, …
  valor int not null,      -- positivo: entrou; negativo: saiu
  descricao text,
  criado_em timestamptz not null default now()
);
create index if not exists lancamentos_clube on public.lancamentos (clube_id, id desc);
alter table public.lancamentos enable row level security;

-- cada dirigente vê só o extrato do próprio clube; o administrador vê todos; ninguém escreve direto
drop policy if exists lancamentos_ler on public.lancamentos;
create policy lancamentos_ler on public.lancamentos for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));

-- Faz os lançamentos de uma partida de liga para os dois clubes. Só roda uma vez por partida.
-- Chamada pela função "rodada" (servidor) ou por um administrador.
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_clube bigint;
  v_tv int; v_pat int; v_folha int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  v_tv := round(v_l.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_l.receita_patrocinio::numeric / v_l.rodadas_por_temporada);
  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    select round(coalesce(sum(salario), 0)::numeric / v_l.rodadas_por_temporada) into v_folha from jogadores where clube_id = v_clube;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_clube, v_l.temporada, v_p.rodada, 'tv', v_tv, 'Cota de TV'),
      (v_clube, v_l.temporada, v_p.rodada, 'patrocinio', v_pat, 'Patrocínio'),
      (v_clube, v_l.temporada, v_p.rodada, 'salarios', -v_folha, 'Salários dos jogadores');
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_tv + v_pat - v_folha)
      on conflict (clube_id) do update set caixa = financas.caixa + v_tv + v_pat - v_folha;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;
