-- Trem Soccer · passo G: ligas, clubes, jogadores e escalações.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez sem apagar dados.

-- ---------- administradores ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade
);

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ---------- tabelas ----------
create table if not exists public.ligas (
  id bigint generated always as identity primary key,
  nome text not null,
  temporada int not null default 0,
  estado text not null default 'inscricoes',
  criada_em timestamptz not null default now()
);

create table if not exists public.clubes (
  id bigint generated always as identity primary key,
  liga_id bigint not null references public.ligas on delete cascade,
  grupo text not null,
  dono uuid unique references auth.users on delete set null, -- nulo: clube sem dono, comandado pelo bot
  nome text not null,
  sigla text not null,
  escudo jsonb not null default '{}',
  uniforme jsonb not null default '{}',
  perfil text not null default 'equilibrado',
  assumido_em timestamptz,
  ultimo_acesso timestamptz
);
create unique index if not exists clubes_nome_unico on public.clubes (liga_id, lower(nome));

create table if not exists public.jogadores (
  id bigint generated always as identity primary key,
  clube_id bigint not null references public.clubes on delete cascade,
  nome text not null,
  pais text not null default 'Brasil',
  idade smallint not null,
  pos text not null,
  fam jsonb not null default '{}',
  at smallint[] not null check (array_length(at, 1) = 22),
  principal boolean not null default false
);
create index if not exists jogadores_clube on public.jogadores (clube_id);

-- o talento é oculto: fica numa tabela que os dirigentes não conseguem ler
create table if not exists public.jogadores_ocultos (
  jogador_id bigint primary key references public.jogadores on delete cascade,
  tal smallint not null
);

create table if not exists public.escalacoes (
  id bigint generated always as identity primary key,
  clube_id bigint not null references public.clubes on delete cascade,
  nome text not null,
  padrao boolean not null default false,
  dados jsonb not null,
  atualizada_em timestamptz not null default now(),
  unique (clube_id, nome)
);

-- ---------- regras de acesso ----------
alter table public.admins enable row level security;
alter table public.ligas enable row level security;
alter table public.clubes enable row level security;
alter table public.jogadores enable row level security;
alter table public.jogadores_ocultos enable row level security;
alter table public.escalacoes enable row level security;

drop policy if exists admins_proprio on public.admins;
create policy admins_proprio on public.admins for select to authenticated using (user_id = auth.uid());

-- todo mundo lê ligas, clubes e jogadores; só o administrador escreve direto
drop policy if exists ligas_ler on public.ligas;
create policy ligas_ler on public.ligas for select to anon, authenticated using (true);
drop policy if exists clubes_ler on public.clubes;
create policy clubes_ler on public.clubes for select to anon, authenticated using (true);
drop policy if exists jogadores_ler on public.jogadores;
create policy jogadores_ler on public.jogadores for select to anon, authenticated using (true);

drop policy if exists ligas_admin on public.ligas;
create policy ligas_admin on public.ligas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists clubes_admin on public.clubes;
create policy clubes_admin on public.clubes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists jogadores_admin on public.jogadores;
create policy jogadores_admin on public.jogadores for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists ocultos_admin on public.jogadores_ocultos;
create policy ocultos_admin on public.jogadores_ocultos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- cada dirigente lê e escreve só as escalações do próprio clube
drop policy if exists escalacoes_dono on public.escalacoes;
create policy escalacoes_dono on public.escalacoes for all to authenticated
  using (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()))
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));

-- ---------- ações do dirigente ----------
-- Assume um clube sem dono, sorteado, e dá a ele nome, sigla, escudo e uniforme.
create or replace function public.assumir_clube(p_nome text, p_sigla text, p_escudo jsonb, p_uniforme jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_liga bigint;
begin
  if auth.uid() is null then raise exception 'É preciso entrar na conta.'; end if;
  if exists (select 1 from clubes where dono = auth.uid()) then raise exception 'Você já tem um clube.'; end if;
  p_nome := btrim(p_nome);
  p_sigla := upper(btrim(p_sigla));
  if char_length(p_nome) < 3 or char_length(p_nome) > 30 then raise exception 'O nome do clube deve ter de 3 a 30 caracteres.'; end if;
  if p_sigla !~ '^[A-Z0-9]{3}$' then raise exception 'A sigla deve ter 3 letras ou números.'; end if;
  if octet_length(p_escudo::text) > 500 or octet_length(p_uniforme::text) > 500 then raise exception 'Escudo ou uniforme inválido.'; end if;
  -- os grupos são preenchidos em ordem: primeiro o A, depois o B, e assim por diante
  select id, liga_id into v_id, v_liga from clubes where dono is null
    and liga_id = (select max(id) from ligas)
    order by grupo, random() limit 1 for update skip locked;
  if v_id is null then raise exception 'Não há vagas na liga no momento.'; end if;
  if exists (select 1 from clubes where liga_id = v_liga and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  update clubes set dono = auth.uid(), nome = p_nome, sigla = p_sigla, escudo = p_escudo, uniforme = p_uniforme,
    assumido_em = now(), ultimo_acesso = now() where id = v_id;
  return v_id;
end $$;

-- Troca o escudo e o uniforme do próprio clube.
create or replace function public.editar_visual(p_escudo jsonb, p_uniforme jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if octet_length(p_escudo::text) > 500 or octet_length(p_uniforme::text) > 500 then raise exception 'Escudo ou uniforme inválido.'; end if;
  update clubes set escudo = p_escudo, uniforme = p_uniforme where dono = auth.uid();
end $$;

-- Marca o acesso do dirigente (conta para a regra de inatividade).
create or replace function public.registrar_acesso() returns void
language sql security definer set search_path = public as $$
  update clubes set ultimo_acesso = now() where dono = auth.uid()
$$;

revoke execute on function public.assumir_clube(text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.editar_visual(jsonb, jsonb) from public, anon;
revoke execute on function public.registrar_acesso() from public, anon;
grant execute on function public.assumir_clube(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.editar_visual(jsonb, jsonb) to authenticated;
grant execute on function public.registrar_acesso() to authenticated;
grant execute on function public.eh_admin() to anon, authenticated;
