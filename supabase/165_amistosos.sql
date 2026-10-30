-- Trem Soccer · aba Amistoso: tática própria de amistoso, desafio entre clubes com o jogo gravado (replay e relatório),
-- parceiros de treino, a opção "Aceitar amistosos" e o bloqueio do próximo adversário oficial.
-- O banco confere as regras, lê a tática do desafiado e sorteia a semente; o navegador simula e grava o resultado na linha.
-- Amistoso contra bot de estilo ou clube sem dirigente não passa por aqui (roda só no navegador).
-- Regras: opção desmarcada por padrão; contra dirigente, os dois com a opção marcada, 1 por dia (fuso de Brasília) contra o
-- mesmo clube e nunca contra o próximo adversário oficial; parceiro de treino libera tudo isso.
-- Replay e relatório completo somem depois de 7 dias (limpar_amistosos); placar e resumo ficam para sempre.
-- Precisa do 100_tatica_da_base.sql (eh_admin, padrão de RLS). Depois: publicar o site. A função rodada não muda.
-- Pode ser executado mais de uma vez.

alter table public.clubes add column if not exists aceita_amistoso boolean not null default false;

-- mesmo formato de taticas.dados; o desafiante não lê a do outro direto, só pela iniciar_amistoso
create table if not exists public.taticas_amistoso (
  clube_id bigint primary key references public.clubes on delete cascade,
  dados jsonb not null,
  atualizada_em timestamptz not null default now()
);
alter table public.taticas_amistoso enable row level security;
drop policy if exists taticas_amistoso_ler on public.taticas_amistoso;
create policy taticas_amistoso_ler on public.taticas_amistoso for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists taticas_amistoso_inserir on public.taticas_amistoso;
create policy taticas_amistoso_inserir on public.taticas_amistoso for insert to authenticated
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists taticas_amistoso_alterar on public.taticas_amistoso;
create policy taticas_amistoso_alterar on public.taticas_amistoso for update to authenticated
  using (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()))
  with check (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
drop policy if exists taticas_amistoso_apagar on public.taticas_amistoso;
create policy taticas_amistoso_apagar on public.taticas_amistoso for delete to authenticated
  using (exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));

-- parceiros de treino: par único (menor id, maior id); aceita_em nulo = pedido pendente
create table if not exists public.parcerias_amistoso (
  clube_a bigint not null references public.clubes on delete cascade,
  clube_b bigint not null references public.clubes on delete cascade,
  pedida_por bigint not null,
  aceita_em timestamptz,
  primary key (clube_a, clube_b),
  check (clube_a < clube_b)
);
alter table public.parcerias_amistoso enable row level security;
drop policy if exists parcerias_amistoso_ler on public.parcerias_amistoso;
create policy parcerias_amistoso_ler on public.parcerias_amistoso for select to authenticated
  using (exists (select 1 from public.clubes c where c.id in (clube_a, clube_b) and c.dono = auth.uid()));

-- um amistoso contra dirigente; placar nulo = não terminou (o navegador fechou antes de gravar)
create table if not exists public.amistosos (
  id bigint generated always as identity primary key,
  desafiante bigint not null references public.clubes on delete cascade,
  desafiado bigint not null references public.clubes on delete cascade,
  mando text not null check (mando in ('casa', 'fora')), -- do ponto de vista do desafiante
  semente integer not null,
  criado_em timestamptz not null default now(),
  placar smallint[],   -- [gols da casa, gols de fora]
  resumo jsonb,        -- xg, posse, chutes
  partida jsonb,       -- o que o replay usa; some em 7 dias
  relatorio jsonb,     -- relatório completo; some em 7 dias
  visto_em timestamptz -- o desafiado viu na Central
);
create index if not exists amistosos_desafiante on public.amistosos (desafiante, desafiado, criado_em);
create index if not exists amistosos_desafiado on public.amistosos (desafiado, criado_em);
alter table public.amistosos enable row level security;
drop policy if exists amistosos_ler on public.amistosos;
create policy amistosos_ler on public.amistosos for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id in (desafiante, desafiado) and c.dono = auth.uid()));

-- clube que troca de dono não leva a tática de amistoso, as parcerias nem a opção do anterior
create or replace function public.amistoso_sem_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dono is distinct from old.dono then
    delete from taticas_amistoso where clube_id = new.id;
    delete from parcerias_amistoso where new.id in (clube_a, clube_b);
    new.aceita_amistoso := false;
  end if;
  return new;
end $$;
drop trigger if exists amistoso_sem_dono on public.clubes;
create trigger amistoso_sem_dono before update of dono on public.clubes
  for each row execute function public.amistoso_sem_dono();

create or replace function public.dono_do_clube_amistoso(p_clube bigint) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from clubes where id = p_clube and dono = auth.uid()) then
    raise exception 'Sem permissão.';
  end if;
end $$;

create or replace function public.parceiros_amistoso(p_a bigint, p_b bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parcerias_amistoso
                 where clube_a = least(p_a, p_b) and clube_b = greatest(p_a, p_b) and aceita_em is not null)
$$;

-- null = liberado; senão 'fechado', 'voce_fechado', 'proximo' ou 'hoje' (nessa ordem). Parceiro libera tudo.
create or replace function public.motivo_amistoso(p_desafiante bigint, p_desafiado bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_eu clubes; v_ele clubes;
begin
  if public.parceiros_amistoso(p_desafiante, p_desafiado) then return null; end if;
  select * into v_eu from clubes where id = p_desafiante;
  select * into v_ele from clubes where id = p_desafiado;
  if v_ele.dono is not null and not v_ele.aceita_amistoso then return 'fechado'; end if;
  if v_ele.dono is not null and not v_eu.aceita_amistoso then return 'voce_fechado'; end if;
  -- só a próxima partida oficial ainda não jogada de cada um (liga ou copa); para olhar mais jogos, trocar o limit
  if exists (
    select 1 from unnest(array[p_desafiante, p_desafiado]) c(id)
    cross join lateral (select casa, fora from partidas
                        where not processada and fase <> 'base' and c.id in (casa, fora)
                        order by inicio, id limit 1) p
    where (p.casa = p_desafiante and p.fora = p_desafiado) or (p.casa = p_desafiado and p.fora = p_desafiante)
  ) then return 'proximo'; end if;
  if v_ele.dono is not null and exists (
    select 1 from amistosos where desafiante = p_desafiante and desafiado = p_desafiado
      and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
  ) then return 'hoje'; end if;
  return null;
end $$;

create or replace function public.adversarios_de_amistoso(p_clube bigint)
returns table (clube_id bigint, motivo text, parceiro boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.dono_do_clube_amistoso(p_clube);
  return query
    select c.id, public.motivo_amistoso(p_clube, c.id), public.parceiros_amistoso(p_clube, c.id)
    from clubes c where c.liga_id = (select liga_id from clubes where id = p_clube) and c.id <> p_clube
    order by c.id;
end $$;

-- o prazo do replay e do relatório completo (7 dias) mora só aqui
create or replace function public.limpar_amistosos() returns void
language sql security definer set search_path = public as $$
  update amistosos set partida = null, relatorio = null
  where criado_em < now() - interval '7 days' and (partida is not null or relatorio is not null)
$$;

create or replace function public.iniciar_amistoso(p_clube bigint, p_desafiado bigint, p_mando text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_m text; v_id bigint; v_semente integer;
begin
  perform public.dono_do_clube_amistoso(p_clube);
  if p_mando is null or p_mando not in ('casa', 'fora') then raise exception 'Mando inválido.'; end if;
  if p_desafiado = p_clube then raise exception 'Escolha outro clube.'; end if;
  if not exists (select 1 from clubes where id = p_desafiado and dono is not null) then
    raise exception 'Clube sem dirigente: jogue direto.';
  end if;
  v_m := public.motivo_amistoso(p_clube, p_desafiado);
  if v_m is not null then
    raise exception '%', case v_m
      when 'fechado' then 'Este clube não aceita amistosos.'
      when 'voce_fechado' then 'Marque "Aceitar amistosos" para desafiar dirigentes.'
      when 'proximo' then 'É o próximo adversário oficial.'
      when 'hoje' then 'Vocês já jogaram hoje.'
      else v_m end;
  end if;
  perform public.limpar_amistosos();
  v_semente := floor(random() * 2147483647)::integer;
  insert into amistosos (desafiante, desafiado, mando, semente) values (p_clube, p_desafiado, p_mando, v_semente)
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'semente', v_semente, 'tatica', coalesce(
    (select dados from taticas_amistoso where clube_id = p_desafiado),
    (select dados from taticas where clube_id = p_desafiado)));
end $$;

create or replace function public.gravar_amistoso(p_id bigint, p_placar smallint[], p_resumo jsonb, p_partida jsonb, p_relatorio jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v amistosos;
begin
  select * into v from amistosos where id = p_id for update;
  if not found then raise exception 'Amistoso não encontrado.'; end if;
  perform public.dono_do_clube_amistoso(v.desafiante);
  if v.placar is not null then raise exception 'Este amistoso já foi gravado.'; end if;
  if v.criado_em < now() - interval '30 minutes' then raise exception 'Passou do prazo para gravar o amistoso.'; end if;
  if coalesce(array_length(p_placar, 1), 0) <> 2 then raise exception 'Placar inválido.'; end if;
  update amistosos set placar = p_placar, resumo = p_resumo, partida = p_partida, relatorio = p_relatorio where id = p_id;
end $$;

create or replace function public.aceitar_amistosos(p_clube bigint, p_aceita boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dono_do_clube_amistoso(p_clube);
  update clubes set aceita_amistoso = coalesce(p_aceita, false) where id = p_clube;
end $$;

create or replace function public.pedir_parceria(p_clube bigint, p_outro bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dono_do_clube_amistoso(p_clube);
  if p_outro = p_clube or not exists (select 1 from clubes where id = p_outro and dono is not null) then
    raise exception 'Só dá para pedir parceria a outro clube com dirigente.';
  end if;
  insert into parcerias_amistoso (clube_a, clube_b, pedida_por) values (least(p_clube, p_outro), greatest(p_clube, p_outro), p_clube)
    on conflict do nothing;
end $$;

create or replace function public.responder_parceria(p_clube bigint, p_outro bigint, p_aceita boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dono_do_clube_amistoso(p_clube);
  if not exists (select 1 from parcerias_amistoso where clube_a = least(p_clube, p_outro) and clube_b = greatest(p_clube, p_outro)
                 and pedida_por = p_outro and aceita_em is null) then
    raise exception 'Não há pedido de parceria deste clube.';
  end if;
  if p_aceita then
    update parcerias_amistoso set aceita_em = now() where clube_a = least(p_clube, p_outro) and clube_b = greatest(p_clube, p_outro);
  else
    delete from parcerias_amistoso where clube_a = least(p_clube, p_outro) and clube_b = greatest(p_clube, p_outro);
  end if;
end $$;

-- desfaz a parceria ou cancela o próprio pedido
create or replace function public.desfazer_parceria(p_clube bigint, p_outro bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dono_do_clube_amistoso(p_clube);
  delete from parcerias_amistoso where clube_a = least(p_clube, p_outro) and clube_b = greatest(p_clube, p_outro);
end $$;

create or replace function public.marcar_amistosos_vistos(p_clube bigint, p_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.dono_do_clube_amistoso(p_clube);
  update amistosos set visto_em = now() where id = any(p_ids) and desafiado = p_clube and visto_em is null;
end $$;

revoke all on function public.dono_do_clube_amistoso(bigint) from public, anon, authenticated;
revoke all on function public.parceiros_amistoso(bigint, bigint) from public, anon, authenticated;
revoke all on function public.limpar_amistosos() from public, anon, authenticated;
revoke all on function public.motivo_amistoso(bigint, bigint) from public, anon;
revoke all on function public.adversarios_de_amistoso(bigint) from public, anon;
revoke all on function public.iniciar_amistoso(bigint, bigint, text) from public, anon;
revoke all on function public.gravar_amistoso(bigint, smallint[], jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.aceitar_amistosos(bigint, boolean) from public, anon;
revoke all on function public.pedir_parceria(bigint, bigint) from public, anon;
revoke all on function public.responder_parceria(bigint, bigint, boolean) from public, anon;
revoke all on function public.desfazer_parceria(bigint, bigint) from public, anon;
revoke all on function public.marcar_amistosos_vistos(bigint, bigint[]) from public, anon;
grant execute on function public.motivo_amistoso(bigint, bigint), public.adversarios_de_amistoso(bigint),
  public.iniciar_amistoso(bigint, bigint, text), public.gravar_amistoso(bigint, smallint[], jsonb, jsonb, jsonb),
  public.aceitar_amistosos(bigint, boolean), public.pedir_parceria(bigint, bigint), public.responder_parceria(bigint, bigint, boolean),
  public.desfazer_parceria(bigint, bigint), public.marcar_amistosos_vistos(bigint, bigint[]) to authenticated;

-- limpeza diária dos 7 dias (a iniciar_amistoso também limpa, caso o pg_cron esteja desligado)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpar-amistosos', '15 4 * * *', 'select public.limpar_amistosos()');
  end if;
end $$;
