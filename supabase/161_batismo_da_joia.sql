-- Trem Soccer · batismo da joia: o dirigente que ganha um talento raro da safra (teto 42 ou 43) propõe o nome dele, e o administrador aprova.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 151 (nome_completo). Depois: publicar o site.
--
-- O jovem chega com o nome sorteado, que vale até a aprovação. O dirigente propõe nome de camisa e nome completo até a primeira partida
-- da temporada; pode propor de novo enquanto não for aprovado (a proposta nova substitui a pendente ou a recusada). Aprovado, trava.
-- A troca vale no jogador e no registro da safra (a notícia do mural passa a usar o nome novo).

create table if not exists public.batismos (
  safra_id bigint primary key references public.safras(id) on delete cascade,
  clube_id bigint not null references public.clubes(id) on delete cascade,
  jogador_id bigint not null references public.jogadores(id) on delete cascade,
  nome_antigo text not null,
  nome text not null, nome_completo text not null,
  estado text not null default 'pendente', -- pendente, aprovado ou recusado
  motivo text,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
alter table public.batismos enable row level security;
drop policy if exists batismos_do_dono on public.batismos;
create policy batismos_do_dono on public.batismos for select
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id = clube_id and c.dono = auth.uid()));
grant select on public.batismos to authenticated;

-- nome sem acento nem caixa, para a camisa não repetir na liga (como o gerador faz)
create or replace function public.nome_sem_acento(p text) returns text language sql immutable as $$
  select lower(translate(btrim(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')) $$;

create or replace function public.batizar_joia(p_safra bigint, p_nome text, p_nome_completo text) returns void
language plpgsql security definer set search_path = public as $$
declare s record; v_jogador bigint; v_nome text := btrim(coalesce(p_nome, '')); v_completo text := btrim(coalesce(p_nome_completo, ''));
begin
  select sf.*, l.temporada as atual into s from safras sf join clubes c on c.id = sf.clube_id join ligas l on l.id = sf.liga_id
    where sf.id = p_safra and c.dono = auth.uid();
  if not found then raise exception 'Esta joia não é do seu clube.'; end if;
  if s.temporada <> s.atual then raise exception 'O batismo é só na temporada em que a joia chega.'; end if;
  if exists (select 1 from partidas where liga_id = s.liga_id and processada) then raise exception 'O prazo acabou: a temporada já começou.'; end if;
  if exists (select 1 from batismos where safra_id = p_safra and estado = 'aprovado') then raise exception 'Esta joia já foi batizada.'; end if;
  if v_nome !~ '^[[:alpha:]][[:alpha:] ''.-]{1,15}$' then raise exception 'Nome de camisa: de 2 a 16 letras.'; end if;
  if v_completo !~ '^[[:alpha:]][[:alpha:] ''.-]{2,39}$' then raise exception 'Nome completo: de 3 a 40 letras.'; end if;
  select id into v_jogador from jogadores where clube_id = s.clube_id and nome = s.jogador limit 1;
  if v_jogador is null then raise exception 'A joia não está mais no clube.'; end if;
  if exists (select 1 from jogadores where id <> v_jogador and nome_sem_acento(nome) = nome_sem_acento(v_nome)) then
    raise exception 'Já existe um % na liga.', v_nome;
  end if;
  insert into batismos (safra_id, clube_id, jogador_id, nome_antigo, nome, nome_completo) values (p_safra, s.clube_id, v_jogador, s.jogador, v_nome, v_completo)
    on conflict (safra_id) do update set nome = excluded.nome, nome_completo = excluded.nome_completo, estado = 'pendente', motivo = null,
      criado_em = now(), decidido_em = null;
end $$;
revoke execute on function public.batizar_joia(bigint, text, text) from public, anon;
grant execute on function public.batizar_joia(bigint, text, text) to authenticated;

create or replace function public.decidir_batismo(p_safra bigint, p_aprovar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if not public.eh_admin() then raise exception 'Só o administrador decide o batismo.'; end if;
  select * into b from batismos where safra_id = p_safra and estado = 'pendente' for update;
  if not found then raise exception 'Esse batismo não está pendente.'; end if;
  if p_aprovar then
    if exists (select 1 from jogadores where id <> b.jogador_id and nome_sem_acento(nome) = nome_sem_acento(b.nome)) then
      raise exception 'Já existe um % na liga: recuse com esse motivo.', b.nome;
    end if;
    update jogadores set nome = b.nome, nome_completo = b.nome_completo where id = b.jogador_id;
    update safras set jogador = b.nome where id = p_safra;
    update revelados set nome = b.nome where jogador_id = b.jogador_id;
    update batismos set estado = 'aprovado', decidido_em = now() where safra_id = p_safra;
  else
    update batismos set estado = 'recusado', motivo = nullif(btrim(coalesce(p_motivo, '')), ''), decidido_em = now() where safra_id = p_safra;
  end if;
end $$;
revoke execute on function public.decidir_batismo(bigint, boolean, text) from public, anon;
grant execute on function public.decidir_batismo(bigint, boolean, text) to authenticated;
