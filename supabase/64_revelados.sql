-- Trem Soccer · registro das promessas reveladas pela base de cada clube.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 60_juvenis_e_formador.sql. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Todo jovem que nasce num clube (sobe na virada ou vem na peneira) fica anotado: temporada, como chegou, idade e atributos da chegada.
-- O registro continua mesmo que o jogador saia do clube. A tela da Base mostra a lista.

create table if not exists public.revelados (
  id bigint generated always as identity primary key,
  liga_id bigint not null references public.ligas(id) on delete cascade,
  clube_id bigint not null references public.clubes(id) on delete cascade,
  temporada int not null,   -- temporada em que ele passou a fazer parte do clube
  origem text,              -- 'virada' ou 'peneira'; vazio para quem já estava no clube quando o registro começou
  jogador_id bigint references public.jogadores(id) on delete set null,
  nome text not null, pos text, idade smallint,
  at smallint[]             -- atributos da chegada (a tela calcula a nota de chegada com eles)
);
create index if not exists revelados_clube on public.revelados (clube_id, temporada);
alter table public.revelados enable row level security;
drop policy if exists revelados_ler on public.revelados;
create policy revelados_ler on public.revelados for select using (true);
grant select on public.revelados to anon, authenticated;

-- A temporada sai da trava da multa (temporada + 21 - idade), que a virada e a peneira gravam: na virada o jovem é da temporada que começa.
create or replace function public.anotar_revelado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_liga bigint; v_t int; v_rev int;
begin
  if new.clube_id is null or new.formador is null or new.formador <> new.clube_id then return new; end if;
  select c.liga_id, l.temporada into v_liga, v_t from clubes c join ligas l on l.id = c.liga_id where c.id = new.clube_id;
  if v_liga is null then return new; end if;
  v_rev := coalesce(new.protegido_ate - 21 + new.idade, v_t);
  insert into revelados (liga_id, clube_id, temporada, origem, jogador_id, nome, pos, idade, at)
    values (v_liga, new.clube_id, v_rev, case when v_rev > v_t then 'virada' else 'peneira' end, new.id, new.nome, new.pos, new.idade, new.at);
  return new;
end $$;
drop trigger if exists anotar_revelado on public.jogadores;
create trigger anotar_revelado after insert on public.jogadores for each row execute function public.anotar_revelado();

-- quem já é juvenil hoje entra no registro com a temporada certa; como chegou e a nota de chegada não dá mais para saber
insert into public.revelados (liga_id, clube_id, temporada, origem, jogador_id, nome, pos, idade, at)
  select c.liga_id, j.clube_id, coalesce(j.protegido_ate - 21 + j.idade, l.temporada), null, j.id, j.nome, j.pos,
      j.idade - (l.temporada - coalesce(j.protegido_ate - 21 + j.idade, l.temporada)), null
    from public.jogadores j join public.clubes c on c.id = j.clube_id join public.ligas l on l.id = c.liga_id
    where j.juvenil and not exists (select 1 from public.revelados r where r.jogador_id = j.id);
