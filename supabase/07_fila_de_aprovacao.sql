-- Trem Soccer · fila de aprovação: quem entra pede um clube, e o administrador aprova ou recusa.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez sem apagar dados.

create table if not exists public.pedidos (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references auth.users on delete cascade,
  email text,
  nome text not null,
  sigla text not null,
  escudo jsonb not null default '{}',
  uniforme jsonb not null default '{}',
  estado text not null default 'pendente', -- pendente, aprovado ou recusado
  motivo text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
alter table public.pedidos enable row level security;

-- cada pessoa vê só o próprio pedido; o administrador vê todos. Ninguém escreve direto: só pelas ações abaixo.
drop policy if exists pedidos_ler on public.pedidos;
create policy pedidos_ler on public.pedidos for select to authenticated using (user_id = auth.uid() or public.eh_admin());

-- Envia (ou reenvia, depois de uma recusa) o pedido de clube.
create or replace function public.pedir_clube(p_nome text, p_sigla text, p_escudo jsonb, p_uniforme jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'É preciso entrar na conta.'; end if;
  if exists (select 1 from clubes where dono = auth.uid()) then raise exception 'Você já tem um clube.'; end if;
  p_nome := btrim(p_nome);
  p_sigla := upper(btrim(p_sigla));
  if char_length(p_nome) < 3 or char_length(p_nome) > 30 then raise exception 'O nome do clube deve ter de 3 a 30 caracteres.'; end if;
  if p_sigla !~ '^[A-Z0-9]{3}$' then raise exception 'A sigla deve ter 3 letras ou números.'; end if;
  if octet_length(p_escudo::text) > 500 or octet_length(p_uniforme::text) > 500 then raise exception 'Escudo ou uniforme inválido.'; end if;
  if exists (select 1 from clubes where liga_id = (select max(id) from ligas) and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  if exists (select 1 from pedidos where lower(nome) = lower(p_nome) and estado = 'pendente' and user_id <> auth.uid()) then raise exception 'Já existe um pedido com esse nome.'; end if;
  insert into pedidos (user_id, email, nome, sigla, escudo, uniforme)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_nome, p_sigla, p_escudo, p_uniforme)
  on conflict (user_id) do update set nome = excluded.nome, sigla = excluded.sigla, escudo = excluded.escudo, uniforme = excluded.uniforme,
    estado = 'pendente', motivo = null, criado_em = now(), decidido_em = null
  returning id into v_id;
  return v_id;
end $$;

-- Aprova (entrega um clube sem dono do primeiro grupo com vaga) ou recusa um pedido. Só administrador.
create or replace function public.decidir_pedido(p_id bigint, p_aprovar boolean, p_motivo text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_p pedidos%rowtype;
  v_clube bigint;
  v_liga bigint;
begin
  if not public.eh_admin() then raise exception 'Só o administrador decide pedidos.'; end if;
  select * into v_p from pedidos where id = p_id for update;
  if v_p.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_p.estado <> 'pendente' then raise exception 'Esse pedido já foi decidido.'; end if;
  if not p_aprovar then
    update pedidos set estado = 'recusado', motivo = nullif(btrim(coalesce(p_motivo, '')), ''), decidido_em = now() where id = p_id;
    return null;
  end if;
  if exists (select 1 from clubes where dono = v_p.user_id) then raise exception 'Essa pessoa já tem um clube.'; end if;
  select id, liga_id into v_clube, v_liga from clubes where dono is null and liga_id = (select max(id) from ligas)
    order by grupo, random() limit 1 for update skip locked;
  if v_clube is null then raise exception 'Não há vagas na liga no momento.'; end if;
  if exists (select 1 from clubes where liga_id = v_liga and lower(nome) = lower(v_p.nome)) then raise exception 'Já existe um clube com esse nome. Recuse o pedido e peça outro nome.'; end if;
  update clubes set dono = v_p.user_id, nome = v_p.nome, sigla = v_p.sigla, escudo = v_p.escudo, uniforme = v_p.uniforme,
    assumido_em = now(), ultimo_acesso = now() where id = v_clube;
  update pedidos set estado = 'aprovado', decidido_em = now() where id = p_id;
  return v_clube;
end $$;

revoke execute on function public.pedir_clube(text, text, jsonb, jsonb) from public, anon;
revoke execute on function public.decidir_pedido(bigint, boolean, text) from public, anon;
grant execute on function public.pedir_clube(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.decidir_pedido(bigint, boolean, text) to authenticated;

-- fecha a entrada direta: a partir de agora ninguém assume clube sem passar pela fila
revoke execute on function public.assumir_clube(text, text, jsonb, jsonb) from authenticated;
