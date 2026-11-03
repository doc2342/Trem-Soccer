-- Trem Soccer · pedido de troca do administrador: escudo, nome do clube, nome do estádio e mosaico (antes, só o escudo enviado, no 51).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 51 (escudo_troca) e do 116 (estadio_visual). Não exige republicar função; depois, publicar o site.
--
-- clubes.troca_pedida: o que o administrador pediu para trocar ('escudo', 'nome', 'estadio', 'mosaico'). Aparece no mural do clube.
--   escudo: a imagem enviada sai (o desenho volta); estadio e mosaico: o texto sai (volta o padrão). O nome fica até o dirigente trocar.
--   Cada item sai sozinho quando o dirigente mexe nele (gatilho abaixo); tudo sai quando o clube troca de dono.
-- renomear_clube: o dirigente troca nome e sigla à vontade até a 1ª rodada da liga começar (a cada temporada; sem calendário, vale);
--   depois, só com o pedido do administrador. As regras são as do pedido de clube. pode_renomear_clube diz se o botão aparece.

alter table public.clubes add column if not exists troca_pedida text[] not null default '{}';
update public.clubes set troca_pedida = array['escudo'] where escudo_troca and troca_pedida = '{}';

create or replace function public.limpar_troca_pedida() returns trigger
language plpgsql as $$
declare v text[] := new.troca_pedida;
begin
  if v = '{}' then return new; end if;
  if new.dono is distinct from old.dono then new.troca_pedida := '{}'; new.escudo_troca := false; return new; end if;
  if new.escudo is distinct from old.escudo then v := array_remove(v, 'escudo'); new.escudo_troca := false; end if;
  if new.nome is distinct from old.nome or new.sigla is distinct from old.sigla then v := array_remove(v, 'nome'); end if;
  if coalesce(new.estadio_visual->>'nomeEstadio', '') not in ('', coalesce(old.estadio_visual->>'nomeEstadio', '')) then v := array_remove(v, 'estadio'); end if;
  if coalesce(new.estadio_visual->>'mosaico', '') not in ('', coalesce(old.estadio_visual->>'mosaico', '')) then v := array_remove(v, 'mosaico'); end if;
  new.troca_pedida := v;
  return new;
end $$;
drop trigger if exists limpar_troca_pedida on public.clubes;
create trigger limpar_troca_pedida before update on public.clubes for each row execute function public.limpar_troca_pedida();

create or replace function public.pedir_troca(p_clube bigint, p_itens text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Sem permissão.'; end if;
  if coalesce(cardinality(p_itens), 0) = 0 or not p_itens <@ array['escudo', 'nome', 'estadio', 'mosaico'] then raise exception 'Escolha o que trocar.'; end if;
  -- primeiro tira o que precisa sair; o pedido vai num segundo update, para o gatilho não apagar o que acabou de ser pedido
  update clubes set escudo = case when 'escudo' = any(p_itens) then escudo - 'img' else escudo end,
    estadio_visual = case when estadio_visual is null then null
      else estadio_visual - (case when 'estadio' = any(p_itens) then array['nomeEstadio'] else '{}' end || case when 'mosaico' = any(p_itens) then array['mosaico'] else '{}' end) end
    where id = p_clube;
  update clubes set troca_pedida = array(select distinct unnest(troca_pedida || p_itens) order by 1), escudo_troca = escudo_troca or 'escudo' = any(p_itens)
    where id = p_clube;
end $$;
revoke execute on function public.pedir_troca(bigint, text[]) from public, anon;
grant execute on function public.pedir_troca(bigint, text[]) to authenticated;

-- a chamada antiga (51) segue valendo
create or replace function public.pedir_troca_de_escudo(p_clube bigint) returns void
language sql security definer set search_path = public as $$ select public.pedir_troca(p_clube, array['escudo']) $$;

create or replace function public.pode_renomear_clube() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select 'nome' = any(c.troca_pedida)
    or not exists (select 1 from partidas p where p.liga_id = c.liga_id and p.fase = 'liga' and p.rodada = 1 and p.inicio <= now())
    from clubes c where c.dono = auth.uid() limit 1), false)
$$;
revoke execute on function public.pode_renomear_clube() from public, anon;
grant execute on function public.pode_renomear_clube() to authenticated;

create or replace function public.renomear_clube(p_nome text, p_sigla text) returns void
language plpgsql security definer set search_path = public as $$
declare v_c record;
begin
  select id, liga_id, troca_pedida into v_c from clubes where dono = auth.uid() limit 1;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if not public.pode_renomear_clube() then raise exception 'Depois da 1ª rodada, o nome do clube só muda a pedido do administrador.'; end if;
  p_nome := btrim(p_nome);
  p_sigla := upper(btrim(p_sigla));
  if char_length(p_nome) < 3 or char_length(p_nome) > 30 then raise exception 'O nome do clube deve ter de 3 a 30 caracteres.'; end if;
  if p_sigla !~ '^[A-Z0-9]{3}$' then raise exception 'A sigla deve ter 3 letras ou números.'; end if;
  if exists (select 1 from clubes where liga_id = v_c.liga_id and id <> v_c.id and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  update clubes set nome = p_nome, sigla = p_sigla where id = v_c.id;
end $$;
revoke execute on function public.renomear_clube(text, text) from public, anon;
grant execute on function public.renomear_clube(text, text) to authenticated;
