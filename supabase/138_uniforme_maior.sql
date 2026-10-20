-- Trem Soccer · uniformes com mais opções (terceira cor, textura, frisos por peça): limite maior para o uniforme.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- As três funções são as mesmas de antes (07, 95 e 51); só muda o tamanho máximo do uniforme (titular + reserva): 500/900 -> 2000 bytes.

-- pedir_clube (igual ao 07, com o limite novo)
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
  if octet_length(p_escudo::text) > 500 or octet_length(p_uniforme::text) > 2000 then raise exception 'Escudo ou uniforme inválido.'; end if;
  if exists (select 1 from clubes where liga_id = (select max(id) from ligas) and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  if exists (select 1 from pedidos where lower(nome) = lower(p_nome) and estado = 'pendente' and user_id <> auth.uid()) then raise exception 'Já existe um pedido com esse nome.'; end if;
  insert into pedidos (user_id, email, nome, sigla, escudo, uniforme)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_nome, p_sigla, p_escudo, p_uniforme)
  on conflict (user_id) do update set nome = excluded.nome, sigla = excluded.sigla, escudo = excluded.escudo, uniforme = excluded.uniforme,
    estado = 'pendente', motivo = null, criado_em = now(), decidido_em = null
  returning id into v_id;
  return v_id;
end $$;

-- pedir_clube_extra (igual ao 95, com o limite novo)
create or replace function public.pedir_clube_extra(p_pais text, p_nome text, p_sigla text, p_escudo jsonb, p_uniforme jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if auth.uid() is null then raise exception 'É preciso entrar na conta.'; end if;
  v_motivo := impedimento_de_extra(auth.uid(), p_pais);
  if v_motivo is not null then raise exception '%', v_motivo; end if;
  p_nome := btrim(p_nome);
  p_sigla := upper(btrim(p_sigla));
  if char_length(p_nome) < 3 or char_length(p_nome) > 30 then raise exception 'O nome do clube deve ter de 3 a 30 caracteres.'; end if;
  if p_sigla !~ '^[A-Z0-9]{3}$' then raise exception 'A sigla deve ter 3 letras ou números.'; end if;
  if octet_length(p_escudo::text) > 500 or octet_length(p_uniforme::text) > 2000 then raise exception 'Escudo ou uniforme inválido.'; end if;
  if exists (select 1 from clubes where liga_id = (select max(id) from ligas) and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  if exists (select 1 from pedidos where lower(nome) = lower(p_nome) and estado = 'pendente')
     or exists (select 1 from pedidos_extra where lower(nome) = lower(p_nome) and estado = 'pendente' and user_id <> auth.uid()) then raise exception 'Já existe um pedido com esse nome.'; end if;
  insert into pedidos_extra (user_id, email, pais, nome, sigla, escudo, uniforme)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_pais, p_nome, p_sigla, p_escudo, p_uniforme)
  on conflict (user_id) do update set pais = excluded.pais, nome = excluded.nome, sigla = excluded.sigla, escudo = excluded.escudo, uniforme = excluded.uniforme,
    estado = 'pendente', motivo = null, clube_id = null, criado_em = now(), decidido_em = null;
end $$;

-- editar_visual (igual ao 51, com o limite novo)
create or replace function public.editar_visual(p_escudo jsonb, p_uniforme jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_img jsonb;
begin
  if octet_length(p_escudo::text) > 600 or octet_length(p_uniforme::text) > 2000 then raise exception 'Escudo ou uniforme inválido.'; end if;
  if jsonb_typeof(p_escudo) <> 'object' or jsonb_typeof(p_uniforme) <> 'object' then raise exception 'Escudo ou uniforme inválido.'; end if;
  select escudo->'img' into v_img from clubes where dono = auth.uid();
  update clubes set escudo = (p_escudo - 'img') || case when v_img is null or v_img = 'null'::jsonb then '{}'::jsonb else jsonb_build_object('img', v_img) end,
    uniforme = p_uniforme, escudo_troca = false
    where dono = auth.uid();
end $$;
