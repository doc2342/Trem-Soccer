-- 77: outros países na mesma liga (passo 1 de 4).
-- Cada país novo é UM grupo de 10 clubes sem dirigente (ARG, URU, COL, CHI), com uma divisão só, sem acesso nem descenso.
-- O clube estrangeiro usa divisao = 1 (os valores de TV, patrocínio, ingresso e teto da Série A; a régua própria vem no passo 2).
-- Rodar depois do 76. Não exige republicar funções, mas a `rodada` nova (mercado dos bots por país) deve ser publicada antes de criar os países.

alter table public.clubes add column if not exists pais text not null default 'Brasil';

create or replace function public.pais_do_grupo(p_grupo text) returns text language sql immutable as $$
  select case p_grupo when 'ARG' then 'Argentina' when 'URU' then 'Uruguai' when 'COL' then 'Colômbia' when 'CHI' then 'Chile' else 'Brasil' end
$$;

-- grupo de país estrangeiro é sempre primeira divisão (vale também no reinício do teste)
create or replace function public.divisao_do_grupo(p_grupo text) returns smallint language sql immutable as $$
  select (case when p_grupo = 'A' or public.pais_do_grupo(p_grupo) <> 'Brasil' then 1 when p_grupo in ('B', 'C') then 2 else 3 end)::smallint
$$;

-- o clube nasce com o país, a divisão e a torcida do grupo dele (a tela do administrador só manda o grupo)
create or replace function public.clube_do_pais() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.pais := pais_do_grupo(new.grupo);
  if new.pais <> 'Brasil' then
    new.divisao := 1;
    new.torcida := coalesce((select d.torcida_base from divisoes d where d.liga_id = new.liga_id and d.divisao = 1), new.torcida);
  end if;
  return new;
end $$;
drop trigger if exists clube_do_pais on public.clubes;
create trigger clube_do_pais before insert on public.clubes for each row execute function public.clube_do_pais();

-- Fronteira fechada até o passo 4 (limite de estrangeiros, multa e empréstimo para fora): jogador não troca de clube entre países.
-- Vale para multa, venda negociada, empréstimo e mercado dos bots, porque todos mudam jogadores.clube_id.
-- ponytail: trava única e provisória; no passo 4 sai e entram as regras de cada caminho.
create or replace function public.fronteira_fechada() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.clube_id is not null and new.clube_id is not null and old.clube_id <> new.clube_id
     and (select pais from clubes where id = old.clube_id) <> (select pais from clubes where id = new.clube_id) then
    raise exception 'Transferência entre países ainda não está aberta.';
  end if;
  return new;
end $$;
drop trigger if exists fronteira_fechada on public.jogadores;
create trigger fronteira_fechada before update of clube_id on public.jogadores for each row execute function public.fronteira_fechada();

-- Dirigente novo só recebe clube do Brasil (sem isto, o grupo ARG entraria na fila logo depois da Série A).
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
  select id, liga_id into v_clube, v_liga from clubes where dono is null and pais = 'Brasil' and liga_id = (select max(id) from ligas)
    order by grupo, random() limit 1 for update skip locked;
  if v_clube is null then raise exception 'Não há vagas na liga no momento.'; end if;
  if exists (select 1 from clubes where liga_id = v_liga and lower(nome) = lower(v_p.nome)) then raise exception 'Já existe um clube com esse nome. Recuse o pedido e peça outro nome.'; end if;
  update clubes set dono = v_p.user_id, nome = v_p.nome, sigla = v_p.sigla, escudo = v_p.escudo, uniforme = v_p.uniforme,
    assumido_em = now(), ultimo_acesso = now() where id = v_clube;
  update pedidos set estado = 'aprovado', decidido_em = now() where id = p_id;
  return v_clube;
end $$;
