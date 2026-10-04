-- Trem Soccer · fase 2, passo M2: venda negociada, lista de transferência e taxa de venda.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 19_mercado.sql já executado. Não exige publicar função nenhuma de novo.
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares.

alter table public.jogadores add column if not exists a_venda boolean default false; -- na lista de transferência
alter table public.jogadores add column if not exists preco_pedido int;              -- quanto o dono pede
alter table public.jogadores add column if not exists chegou_janela text;            -- janela em que chegou ao clube atual (inicio ou meio)
alter table public.transferencias add column if not exists taxa_distribuida boolean not null default false;

-- propostas de compra entre dirigentes
create table if not exists public.propostas (
  id bigint generated always as identity primary key,
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  jogador_id bigint not null references public.jogadores on delete cascade,
  comprador bigint not null references public.clubes on delete cascade,
  vendedor bigint not null references public.clubes on delete cascade,
  valor int not null,          -- o que o comprador oferece ao clube
  salario int not null,        -- contrato que o comprador dará ao jogador
  temporadas int not null,
  contra_valor int,            -- o que o vendedor pediu de volta
  estado text not null default 'pendente', -- pendente, contra, aceita, recusada, cancelada
  motivo text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index if not exists propostas_vendedor on public.propostas (vendedor, id desc);
create index if not exists propostas_comprador on public.propostas (comprador, id desc);
alter table public.propostas enable row level security;
drop policy if exists propostas_ler on public.propostas;
create policy propostas_ler on public.propostas for select to authenticated
  using (public.eh_admin() or exists (select 1 from public.clubes c where c.id in (comprador, vendedor) and c.dono = auth.uid()));

-- Quando o jogador muda de clube (por qualquer caminho), sai da lista de transferência e as propostas abertas por ele caem.
create or replace function public.jogador_mudou_de_clube() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.clube_id is distinct from old.clube_id then
    new.a_venda := false; new.preco_pedido := null;
    update propostas set estado = 'cancelada', motivo = 'O jogador mudou de clube.', atualizada_em = now()
      where jogador_id = new.id and estado in ('pendente', 'contra');
  end if;
  return new;
end $$;
drop trigger if exists jogadores_mudou_de_clube on public.jogadores;
create trigger jogadores_mudou_de_clube before update on public.jogadores for each row execute function public.jogador_mudou_de_clube();

-- Lista de transferência: o dono marca o jogador à venda com o preço pedido (preço nulo ou zero tira da lista).
create or replace function public.listar_jogador(p_jogador bigint, p_preco int) returns void
language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  select c.dono into v_dono from jogadores j join clubes c on c.id = j.clube_id where j.id = p_jogador;
  if v_dono is null or v_dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  update jogadores set a_venda = coalesce(p_preco, 0) > 0, preco_pedido = case when coalesce(p_preco, 0) > 0 then p_preco else null end where id = p_jogador;
end $$;
revoke execute on function public.listar_jogador(bigint, int) from public, anon;
grant execute on function public.listar_jogador(bigint, int) to authenticated;

-- Taxa da venda negociada: 30% na primeira janela depois da chegada do jogador (e na mesma), 20% na segunda, 10% da terceira em diante.
-- Quem está no clube desde o elenco inicial paga 10%.
create or replace function public.taxa_da_venda(p_jogador bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when j.chegou_temporada is null then 0.10
    when (l.temporada * 2 + case when janela_do_mercado(l.id) = 'meio' then 1 else 0 end)
       - (j.chegou_temporada * 2 + case when j.chegou_janela = 'meio' then 1 else 0 end) <= 1 then 0.30
    when (l.temporada * 2 + case when janela_do_mercado(l.id) = 'meio' then 1 else 0 end)
       - (j.chegou_temporada * 2 + case when j.chegou_janela = 'meio' then 1 else 0 end) = 2 then 0.20
    else 0.10 end
  from jogadores j join clubes c on c.id = j.clube_id join ligas l on l.id = c.liga_id where j.id = p_jogador
$$;
grant execute on function public.taxa_da_venda(bigint) to anon, authenticated;

-- Proposta de compra: só entre clubes com dirigente e só com a janela aberta.
create or replace function public.fazer_proposta(p_jogador bigint, p_valor int, p_salario int, p_temporadas int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_teto int; v_id bigint;
begin
  select * into v_para from clubes where dono = auth.uid();
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.dono is null then raise exception 'Clube sem dono não negocia: dele, só pela multa rescisória.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  if janela_do_mercado(v_l.id) is null then raise exception 'O mercado está fechado. As janelas são até o fim da rodada 2 e entre as rodadas 9 e 11.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da proposta.'; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < greatest(coalesce(v_j.salario, 0), coalesce(v_j.salario_mercado, 0)) then
    raise exception 'O salário oferecido ao jogador não pode ser menor que % mil por temporada.', greatest(coalesce(v_j.salario, 0), coalesce(v_j.salario_mercado, 0));
  end if;
  v_teto := teto_do_clube(v_para.id);
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  if coalesce((select caixa from financas where clube_id = v_para.id), 0) < p_valor then raise exception 'Seu caixa não cobre essa proposta.'; end if;
  update propostas set estado = 'cancelada', motivo = 'Substituída por uma proposta nova.', atualizada_em = now()
    where jogador_id = p_jogador and comprador = v_para.id and estado in ('pendente', 'contra');
  insert into propostas (liga_id, temporada, jogador_id, comprador, vendedor, valor, salario, temporadas)
    values (v_l.id, v_l.temporada, p_jogador, v_para.id, v_de.id, p_valor, p_salario, p_temporadas) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.fazer_proposta(bigint, int, int, int) from public, anon;
grant execute on function public.fazer_proposta(bigint, int, int, int) to authenticated;

-- Fecha o negócio pelo valor combinado. Uso interno (chamada pelas duas funções abaixo).
create or replace function public.fechar_negocio(p_proposta bigint, p_valor int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_p propostas%rowtype;
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_janela text;
  v_teto int; v_folha int; v_jogos int; v_taxa int;
begin
  select * into v_p from propostas where id = p_proposta for update;
  select * into v_j from jogadores where id = v_p.jogador_id for update;
  if v_j.id is null or v_j.clube_id <> v_p.vendedor then raise exception 'O jogador não está mais nesse clube.'; end if;
  select * into v_de from clubes where id = v_p.vendedor;
  select * into v_para from clubes where id = v_p.comprador;
  select * into v_l from ligas where id = v_p.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null then raise exception 'O mercado está fechado: o negócio só fecha com a janela aberta.'; end if;
  if v_janela = 'meio' and v_para.divisao = v_de.divisao then
    select count(*) into v_jogos from resultados r join partidas p on p.id = r.partida_id
      where p.liga_id = v_l.id and p.fase = 'liga' and (p.casa = v_de.id or p.fora = v_de.id)
        and exists (select 1 from jsonb_array_elements(r.relatorio->'jogadores') x where x->>'id' = 'j' || v_j.id);
    if v_jogos >= 5 then raise exception 'Na janela do meio, quem já jogou 5 partidas de liga pelo clube não vai para outro da mesma divisão (ele jogou %).', v_jogos; end if;
  end if;
  if (select count(*) from jogadores where clube_id = v_para.id) >= 50 then raise exception 'O elenco do comprador já tem 50 jogadores.'; end if;
  if (select count(*) from jogadores where clube_id = v_de.id) <= 16 then raise exception 'O elenco do vendedor não pode ficar com menos de 16 jogadores.'; end if;
  v_teto := teto_do_clube(v_para.id);
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_para.id;
  if v_folha + v_p.salario > v_teto then raise exception 'A folha do comprador passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_p.salario, v_teto; end if;
  if coalesce((select caixa from financas where clube_id = v_para.id), 0) < p_valor then raise exception 'O caixa do comprador não cobre o valor (% mil).', p_valor; end if;

  v_taxa := round(p_valor * taxa_da_venda(v_j.id));
  update financas set caixa = caixa - p_valor where clube_id = v_para.id;
  update financas set caixa = caixa + p_valor - v_taxa where clube_id = v_de.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_para.id, v_l.temporada, null, 'compra', -p_valor, 'Compra negociada: ' || v_j.nome || ' (' || v_de.nome || ')'),
    (v_de.id, v_l.temporada, null, 'venda', p_valor, 'Venda negociada: ' || v_j.nome || ' (' || v_para.nome || ')'),
    (v_de.id, v_l.temporada, null, 'taxa', -v_taxa, 'Taxa de venda (' || round(100.0 * v_taxa / p_valor) || '%): ' || v_j.nome);
  update propostas set estado = 'aceita', atualizada_em = now() where id = p_proposta;
  update jogadores set clube_id = v_para.id, salario = v_p.salario, contrato_ate = v_l.temporada + v_p.temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada, chegou_janela = v_janela
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor, taxa)
    values (v_l.id, v_l.temporada, v_janela, 'negociada', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, p_valor, v_taxa);
  return v_j.nome || ' vendido por ' || p_valor || ' mil (taxa de ' || v_taxa || ' mil).';
end $$;
revoke execute on function public.fechar_negocio(bigint, int) from public, anon, authenticated;

-- O dono do jogador responde: aceitar, recusar ou contrapropor (pedir outro valor).
create or replace function public.responder_proposta(p_id bigint, p_acao text, p_valor int default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_p propostas%rowtype;
begin
  select * into v_p from propostas where id = p_id;
  if v_p.id is null or not exists (select 1 from clubes where id = v_p.vendedor and dono = auth.uid()) then raise exception 'Essa proposta não é para o seu clube.'; end if;
  if v_p.estado <> 'pendente' then raise exception 'Essa proposta não está mais aguardando a sua resposta.'; end if;
  if p_acao = 'aceitar' then return fechar_negocio(p_id, v_p.valor);
  elsif p_acao = 'recusar' then update propostas set estado = 'recusada', atualizada_em = now() where id = p_id; return 'Proposta recusada.';
  elsif p_acao = 'contrapropor' then
    if p_valor is null or p_valor <= v_p.valor then raise exception 'A contraproposta precisa ser maior que o valor oferecido.'; end if;
    update propostas set estado = 'contra', contra_valor = p_valor, atualizada_em = now() where id = p_id;
    return 'Contraproposta enviada.';
  end if;
  raise exception 'Resposta desconhecida.';
end $$;
revoke execute on function public.responder_proposta(bigint, text, int) from public, anon;
grant execute on function public.responder_proposta(bigint, text, int) to authenticated;

-- Quem fez a proposta aceita a contraproposta (fecha pelo valor pedido) ou desiste da proposta.
create or replace function public.decidir_contraproposta(p_id bigint, p_aceitar boolean) returns text
language plpgsql security definer set search_path = public as $$
declare v_p propostas%rowtype;
begin
  select * into v_p from propostas where id = p_id;
  if v_p.id is null or not exists (select 1 from clubes where id = v_p.comprador and dono = auth.uid()) then raise exception 'Essa proposta não é do seu clube.'; end if;
  if v_p.estado not in ('pendente', 'contra') then raise exception 'Essa proposta já foi encerrada.'; end if;
  if not p_aceitar then update propostas set estado = 'cancelada', motivo = 'Retirada pelo comprador.', atualizada_em = now() where id = p_id; return 'Proposta retirada.'; end if;
  if v_p.estado <> 'contra' then raise exception 'Não há contraproposta para aceitar.'; end if;
  return fechar_negocio(p_id, v_p.contra_valor);
end $$;
revoke execute on function public.decidir_contraproposta(bigint, boolean) from public, anon;
grant execute on function public.decidir_contraproposta(bigint, boolean) to authenticated;

-- Taxas de venda da temporada que acabou: metade vai, por igual, para os clubes da terceira divisão; metade fica para a segunda taça.
-- Chamada pela página de administração logo depois da virada. Cada taxa só é distribuída uma vez.
create or replace function public.distribuir_taxas(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_total int; v_n int; v_cota int; v_temp int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador distribui as taxas.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  select coalesce(sum(taxa), 0) into v_total from transferencias where liga_id = p_liga and not taxa_distribuida and temporada < v_temp;
  if v_total <= 0 then return 0; end if;
  select count(*) into v_n from clubes where liga_id = p_liga and divisao = 3;
  v_cota := case when v_n > 0 then (v_total / 2) / v_n else 0 end;
  if v_cota > 0 then
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select id, v_temp, null, 'fundo', v_cota, 'Fundo da liga (taxas de venda)' from clubes where liga_id = p_liga and divisao = 3;
    update financas f set caixa = f.caixa + v_cota from clubes c where c.liga_id = p_liga and c.divisao = 3 and c.id = f.clube_id;
  end if;
  update ligas set fundo_taca = fundo_taca + (v_total - v_cota * v_n) where id = p_liga;
  update transferencias set taxa_distribuida = true where liga_id = p_liga and not taxa_distribuida and temporada < v_temp;
  return v_total;
end $$;
revoke execute on function public.distribuir_taxas(bigint) from public, anon;
grant execute on function public.distribuir_taxas(bigint) to authenticated;
