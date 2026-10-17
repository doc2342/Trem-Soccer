-- 111: na aprovação de um pedido de clube, o administrador pode escolher qual clube sem dono do Brasil o dirigente assume,
-- como já acontece no pedido de clube extra (98). Sem escolha, segue o sorteio de antes (grupo mais alto com vaga).
-- Rodar depois do 77. Não exige republicar funções. Pode ser executado mais de uma vez.

drop function if exists public.decidir_pedido(bigint, boolean, text);
create or replace function public.decidir_pedido(p_id bigint, p_aprovar boolean, p_motivo text default null, p_clube bigint default null) returns bigint
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
  select id, liga_id into v_clube, v_liga from clubes where dono is null and pais = 'Brasil' and liga_id = (select max(id) from ligas)
    and (p_clube is null or id = p_clube)
    order by grupo, random() limit 1 for update skip locked;
  if v_clube is null then raise exception '%', case when p_clube is null then 'Não há vagas na liga no momento.' else 'Esse clube não está mais livre.' end; end if;
  if exists (select 1 from clubes where liga_id = v_liga and lower(nome) = lower(v_p.nome)) then raise exception 'Já existe um clube com esse nome. Recuse o pedido e peça outro nome.'; end if;
  update clubes set dono = v_p.user_id, nome = v_p.nome, sigla = v_p.sigla, escudo = v_p.escudo, uniforme = v_p.uniforme,
    assumido_em = now(), ultimo_acesso = now() where id = v_clube;
  update pedidos set estado = 'aprovado', decidido_em = now() where id = p_id;
  return v_clube;
end $$;
grant execute on function public.decidir_pedido(bigint, boolean, text, bigint) to authenticated;
