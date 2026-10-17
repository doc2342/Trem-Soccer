-- Trem Soccer · pedido de clube extra (passo 4 do segundo clube, desenho de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 92, 93 e 94.
--
-- 1. pedidos_extra: um pedido por pessoa (o último), com o país escolhido, nome, sigla, escudo e uniforme.
-- 2. pedir_clube_extra: quem tem direito (dirigentes.direitos) escolhe um país de fora onde ainda não tem clube.
-- 3. aprovar_pedido_extra (admin): sorteia um bot do país e o refaz numa transação só:
--    - os jogadores do bot somem, menos os que estão emprestados a ele ou em negociação com clube de dirigente;
--    - entra o elenco novo que a página do administrador gerou (na média do país) com salários e contratos;
--    - estruturas, torcida e caixa na média dos outros clubes do país; confiança 50; tática, obras e comissão do bot apagadas;
--    - a pessoa gasta um direito.
-- 4. recusar_pedido_extra (admin), com motivo que a pessoa vê.

create table if not exists public.pedidos_extra (
  user_id uuid primary key references auth.users on delete cascade,
  email text,
  pais text not null,
  nome text not null,
  sigla text not null,
  escudo jsonb not null default '{}',
  uniforme jsonb not null default '{}',
  estado text not null default 'pendente', -- pendente, aprovado ou recusado
  motivo text,
  clube_id bigint references public.clubes on delete set null,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz
);
alter table public.pedidos_extra enable row level security;
drop policy if exists pedidos_extra_ler on public.pedidos_extra;
create policy pedidos_extra_ler on public.pedidos_extra for select to authenticated using (user_id = auth.uid() or public.eh_admin());

-- por que esta pessoa não pode ter um clube em p_pais agora (null = pode)
create or replace function public.impedimento_de_extra(p_user uuid, p_pais text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(d.direitos, 0) < 1 then 'Você não tem direito a um clube extra: chegue a 80 de confiança numa virada sem caixa negativo.'
    when d.pode_pedir_desde > (select temporada from ligas where id = (select max(id) from ligas)) then format('Depois de perder ou entregar um clube, só dá para pedir outro na temporada %s.', d.pode_pedir_desde)
    when p_pais = 'Brasil' or not exists (select 1 from clubes where pais = p_pais and dono is null and liga_id = (select max(id) from ligas)) then 'Esse país não tem clube disponível.'
    when exists (select 1 from clubes where dono = p_user and pais = p_pais) then 'Você já tem um clube nesse país.'
    when (select count(*) from clubes where dono = p_user) >= 3 then 'Você já tem 3 clubes, o máximo.'
    when (select count(*) from clubes where dono = p_user and continente_do_pais(pais) = continente_do_pais(p_pais)) >= 2 then format('Você já tem 2 clubes na %s, o máximo por continente.', continente_do_pais(p_pais))
  end
  from (select p_user as u) x left join dirigentes d on d.user_id = x.u
$$;

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
  if octet_length(p_escudo::text) > 500 or octet_length(p_uniforme::text) > 500 then raise exception 'Escudo ou uniforme inválido.'; end if;
  if exists (select 1 from clubes where liga_id = (select max(id) from ligas) and lower(nome) = lower(p_nome)) then raise exception 'Já existe um clube com esse nome.'; end if;
  if exists (select 1 from pedidos where lower(nome) = lower(p_nome) and estado = 'pendente')
     or exists (select 1 from pedidos_extra where lower(nome) = lower(p_nome) and estado = 'pendente' and user_id <> auth.uid()) then raise exception 'Já existe um pedido com esse nome.'; end if;
  insert into pedidos_extra (user_id, email, pais, nome, sigla, escudo, uniforme)
  values (auth.uid(), (select email from auth.users where id = auth.uid()), p_pais, p_nome, p_sigla, p_escudo, p_uniforme)
  on conflict (user_id) do update set pais = excluded.pais, nome = excluded.nome, sigla = excluded.sigla, escudo = excluded.escudo, uniforme = excluded.uniforme,
    estado = 'pendente', motivo = null, clube_id = null, criado_em = now(), decidido_em = null;
end $$;
revoke execute on function public.pedir_clube_extra(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.pedir_clube_extra(text, text, text, jsonb, jsonb) to authenticated;

-- p_elenco: [{nome, pais, idade, pos, fam, at, pe, principal, tal, salario, salario_mercado, contrato_ate, protegido_ate}] gerado na página do administrador
create or replace function public.aprovar_pedido_extra(p_user uuid, p_elenco jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_p pedidos_extra%rowtype; v_motivo text; v_c clubes%rowtype; v_id bigint; r record;
begin
  if not public.eh_admin() then raise exception 'Só o administrador decide pedidos.'; end if;
  select * into v_p from pedidos_extra where user_id = p_user for update;
  if v_p.user_id is null or v_p.estado <> 'pendente' then raise exception 'Esse pedido não está pendente.'; end if;
  if jsonb_array_length(coalesce(p_elenco, '[]'::jsonb)) < 16 then raise exception 'Elenco novo incompleto.'; end if;
  v_motivo := impedimento_de_extra(p_user, v_p.pais);
  if v_motivo is not null then raise exception 'Não dá para aprovar: %', v_motivo; end if;
  if exists (select 1 from clubes where liga_id = (select max(id) from ligas) and lower(nome) = lower(v_p.nome)) then raise exception 'Já existe um clube com esse nome. Recuse o pedido e peça outro nome.'; end if;
  select * into v_c from clubes where dono is null and pais = v_p.pais and liga_id = (select max(id) from ligas) order by random() limit 1 for update skip locked;
  if v_c.id is null then raise exception 'Não há clube sem dono nesse país.'; end if;

  -- os jogadores do bot somem (os emprestados a ele voltam ao clube dono; quem está em negociação com dirigente fica)
  delete from jogadores j where j.clube_id = v_c.id and j.emprestado_de is null
    and not exists (select 1 from propostas p join clubes c on c.id = p.comprador where p.jogador_id = j.id and c.dono is not null and p.estado in ('pendente', 'contra', 'aceita'))
    and not exists (select 1 from pre_contratos pc join clubes c on c.id = pc.clube_id where pc.jogador_id = j.id and c.dono is not null);
  delete from taticas where clube_id = v_c.id;
  delete from obras where clube_id = v_c.id;
  delete from treinadores where clube_id = v_c.id;

  for r in select value as v from jsonb_array_elements(p_elenco) loop
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, pe, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values (v_c.id, r.v->>'nome', coalesce(r.v->>'pais', v_p.pais), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), r.v->>'pe', coalesce((r.v->>'principal')::boolean, false),
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
  end loop;

  -- estruturas, torcida e caixa na média dos outros clubes do país
  update clubes c set dono = p_user, nome = v_p.nome, sigla = v_p.sigla, escudo = v_p.escudo, uniforme = v_p.uniforme,
      assumido_em = now(), ultimo_acesso = now(), dirigente = (select dirigente from clubes where dono = p_user and dirigente is not null limit 1),
      confianca = 50, segundo_clube = false, multas_extra = 0, multas_extra_temporada = null,
      estadio_nivel = m.estadio, ct_nivel = m.ct, medico_nivel = m.medico, fisio_nivel = m.fisio, base_nivel = m.base, torcida = m.torcida,
      humor = 8, torcida_fator = 1, torcida_fator_temporada = null, carne = 0, carne_temporada = null, vermelho_rodadas = 0,
      premio_antecipado = 0, antecipou_temporada = null, candidatos_em = null, peneira_temporada = null, escudo_troca = false, paraquedas = null
    from (select round(avg(estadio_nivel))::smallint estadio, round(avg(ct_nivel))::smallint ct, round(avg(medico_nivel))::smallint medico,
                 round(avg(fisio_nivel))::smallint fisio, round(avg(base_nivel))::smallint base, round(avg(torcida))::int torcida
            from clubes where pais = v_p.pais and liga_id = v_c.liga_id and id <> v_c.id) m
    where c.id = v_c.id;
  update financas set caixa = coalesce((select round(avg(f.caixa))::int from financas f join clubes x on x.id = f.clube_id
                                         where x.pais = v_p.pais and x.liga_id = v_c.liga_id and x.id <> v_c.id and x.dono is null), caixa)
    where clube_id = v_c.id;

  update dirigentes set direitos = direitos - 1 where user_id = p_user;
  update pedidos_extra set estado = 'aprovado', clube_id = v_c.id, decidido_em = now() where user_id = p_user;
  return v_c.id;
end $$;
revoke execute on function public.aprovar_pedido_extra(uuid, jsonb) from public, anon;
grant execute on function public.aprovar_pedido_extra(uuid, jsonb) to authenticated;

create or replace function public.recusar_pedido_extra(p_user uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador decide pedidos.'; end if;
  update pedidos_extra set estado = 'recusado', motivo = nullif(btrim(coalesce(p_motivo, '')), ''), decidido_em = now()
    where user_id = p_user and estado = 'pendente';
  if not found then raise exception 'Esse pedido não está pendente.'; end if;
end $$;
revoke execute on function public.recusar_pedido_extra(uuid, text) from public, anon;
grant execute on function public.recusar_pedido_extra(uuid, text) to authenticated;
