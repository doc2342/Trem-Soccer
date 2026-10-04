-- Trem Soccer · os dirigentes preenchem os grupos em ordem: primeiro o A, depois o B, e assim por diante.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez.

-- 1. Quem criar clube daqui para a frente recebe uma vaga do primeiro grupo que ainda tiver clube sem dono.
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
  select id, liga_id into v_id, v_liga from clubes where dono is null
    and liga_id = (select max(id) from ligas)
    order by grupo, random() limit 1 for update skip locked;
  if v_id is null then raise exception 'Não há vagas na liga no momento.'; end if;
  if exists (select 1 from clubes where liga_id = v_liga and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  update clubes set dono = auth.uid(), nome = p_nome, sigla = p_sigla, escudo = p_escudo, uniforme = p_uniforme,
    assumido_em = now(), ultimo_acesso = now() where id = v_id;
  return v_id;
end $$;

-- 2. Quem já tem clube é levado para os primeiros grupos, por ordem de chegada, trocando de lugar com um clube do bot.
--    Só roda se a liga ainda não tiver calendário: com partidas marcadas, apague o calendário na administração e execute de novo.
do $$
declare
  v_liga bigint := (select max(id) from ligas);
  v_grupos text[];
  r record;
  v_alvo text;
  v_bot bigint;
  n int := 0;
begin
  if v_liga is null then return; end if;
  if exists (select 1 from partidas where liga_id = v_liga) then
    raise notice 'A liga já tem calendário: nenhum clube foi movido. Apague o calendário e execute de novo.';
    return;
  end if;
  select array_agg(g order by g) into v_grupos from (select distinct grupo g from clubes where liga_id = v_liga) x;
  for r in select id, grupo from clubes where liga_id = v_liga and dono is not null order by assumido_em, id loop
    v_alvo := v_grupos[n / 10 + 1];
    n := n + 1;
    if r.grupo <> v_alvo then
      select id into v_bot from clubes where liga_id = v_liga and grupo = v_alvo and dono is null order by random() limit 1;
      if v_bot is not null then
        update clubes set grupo = r.grupo where id = v_bot;
        update clubes set grupo = v_alvo where id = r.id;
      end if;
    end if;
  end loop;
end $$;

select grupo, count(*) filter (where dono is not null) as dirigentes, count(*) filter (where dono is null) as do_bot
from clubes where liga_id = (select max(id) from ligas) group by grupo order by grupo;
