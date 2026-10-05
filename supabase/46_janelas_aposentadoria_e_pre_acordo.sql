-- Trem Soccer · janelas por data, anúncio de aposentadoria, regras de renovação, pré-acordo e pré-contrato.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 41_venda_pelo_agente.sql já executado. Depois, republicar a função "rodada". Pode ser executado mais de uma vez.
--
-- 1. JANELAS POR DATA. A de início abre com a virada e fecha em ligas.janela_inicio_fecha (véspera da rodada 3);
--    a do meio vai de ligas.janela_meio_abre a ligas.janela_meio_fecha. As três datas são gravadas quando o administrador gera o calendário.
--    Depois da última rodada e antes da virada, a janela fica fechada (acabou o trecho de fim de temporada do SQL 38).
-- 2. ANÚNCIO DE APOSENTADORIA. Quando a janela do meio fecha, o jogo sorteia quem para no fim da temporada: jogadores que terão
--    34 anos ou mais na virada e cujo contrato acaba nesta temporada (20% aos 34 ... 80% aos 37). Quem teria 38 para de qualquer jeito.
--    Quem anunciou não pode mais ser vendido, listado nem renovar. Quem tem contrato para a temporada seguinte não se aposenta.
-- 3. RENOVAÇÃO. Com 33 anos ou mais, o contrato só vai até o fim da temporada seguinte; ninguém assina para uma temporada em que teria 38.
--    (O banco encurta sozinho o contrato que passar disso.)
-- 4. PRÉ-ACORDO. Depois da última rodada da liga, dirigentes podem fazer e aceitar propostas entre si; o aceite não se desfaz e o
--    negócio é executado na virada, com nova conferência de caixa, teto de folha e vaga no elenco.
-- 5. PRÉ-CONTRATO. No mesmo período, cada clube pode fazer até 2 propostas de pré-contrato a jogadores de outros clubes com dirigente
--    cujo contrato acaba. As propostas são fechadas; na virada, se o jogador ficou livre, vai para quem ofereceu o maior salário,
--    sem leilão e sem compensação ao clube antigo. Depois da primeira proposta, o clube atual não renova mais com ele.

alter table public.ligas add column if not exists janela_inicio_fecha timestamptz;
alter table public.ligas add column if not exists janela_meio_abre timestamptz;
alter table public.ligas add column if not exists janela_meio_fecha timestamptz;
alter table public.ligas add column if not exists aposentadorias_em int;   -- temporada em que o anúncio já foi feito
alter table public.jogadores add column if not exists aposenta_em int;     -- temporada ao fim da qual o jogador se aposenta
alter table public.jogadores add column if not exists pre_contrato int;    -- temporada em que recebeu proposta de pré-contrato

-- ---------- 1. janelas ----------
create or replace function public.janela_do_mercado(p_liga bigint) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from partidas p where p.liga_id = p_liga and p.fase = 'liga') then 'inicio' -- depois da virada, antes de o calendário existir
    when l.janela_inicio_fecha is not null or l.janela_meio_abre is not null then
      case when l.janela_inicio_fecha is not null and now() <= l.janela_inicio_fecha then 'inicio'
           when l.janela_meio_abre is not null and now() >= l.janela_meio_abre and now() <= l.janela_meio_fecha then 'meio'
           else null end
    -- calendário gerado antes deste arquivo, sem datas: vale a regra antiga, por rodada
    when rodadas_completas(p_liga) < 2 then 'inicio'
    when rodadas_completas(p_liga) in (9, 10) then 'meio'
    else null end
  from ligas l where l.id = p_liga
$$;
grant execute on function public.janela_do_mercado(bigint) to anon, authenticated;

-- a liga acabou (todas as rodadas jogadas e encerradas) e a virada ainda não aconteceu
create or replace function public.periodo_de_pre_acordo(p_liga bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select rodadas_completas(p_liga) >= l.rodadas_por_temporada
     and not exists (select 1 from partidas p where p.liga_id = p_liga and p.fase = 'liga' and p.fim > now())
  from ligas l where l.id = p_liga
$$;
grant execute on function public.periodo_de_pre_acordo(bigint) to anon, authenticated;

-- ---------- 2. anúncio de aposentadoria ----------
-- Pode ser chamada por qualquer um, quantas vezes for: só age uma vez por temporada, depois que a janela do meio fecha.
create or replace function public.anunciar_aposentadorias(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; n int;
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null or v_l.aposentadorias_em is not distinct from v_l.temporada then return 0; end if;
  if not (case when v_l.janela_meio_fecha is not null then now() > v_l.janela_meio_fecha else rodadas_completas(p_liga) >= 11 end) then return 0; end if;
  update jogadores j set aposenta_em = v_l.temporada
    where (j.clube_id in (select id from clubes where liga_id = p_liga) or j.livre_liga = p_liga)
      and j.aposenta_em is null
      and (j.idade + 1 >= 38
        or (j.idade + 1 >= 34 and (j.contrato_ate is null or j.contrato_ate <= v_l.temporada) and random() < (j.idade + 1 - 33) * 0.2));
  get diagnostics n = row_count;
  update ligas set aposentadorias_em = v_l.temporada where id = p_liga;
  return n;
end $$;
revoke execute on function public.anunciar_aposentadorias(bigint) from public, anon;
grant execute on function public.anunciar_aposentadorias(bigint) to authenticated, service_role;

-- ---------- 3. guardas de contrato ----------
-- Antes de qualquer mudança num jogador: quem anunciou a aposentadoria não troca de clube, não renova e não vai à lista;
-- quem recebeu proposta de pré-contrato não renova; e o contrato é encurtado para respeitar a idade.
-- A virada da temporada passa por cima destas guardas (ela renova contratos e envelhece todo mundo de uma vez).
create or replace function public.guardas_do_jogador() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_temp int; v_estende boolean;
begin
  if coalesce(current_setting('trem.virada', true), '') = '1' then return new; end if;
  -- a maioria das gravações (treino, forma, cartões) não mexe em clube, contrato nem lista: sai logo
  if new.clube_id is not distinct from old.clube_id and new.contrato_ate is not distinct from old.contrato_ate
     and new.a_venda is not distinct from old.a_venda then return new; end if;
  select l.temporada into v_temp from ligas l
    where l.id = coalesce((select liga_id from clubes where id = coalesce(new.clube_id, old.clube_id)), new.livre_liga, old.livre_liga);
  if v_temp is null then return new; end if;
  v_estende := new.contrato_ate is not null and (old.contrato_ate is null or new.contrato_ate > old.contrato_ate);
  if old.aposenta_em is not null then
    if new.clube_id is not null and new.clube_id is distinct from old.clube_id then raise exception '% anunciou a aposentadoria: não pode mais ser negociado.', old.nome; end if;
    if v_estende and new.clube_id is not distinct from old.clube_id then raise exception '% anunciou a aposentadoria: não renova o contrato.', old.nome; end if;
    if new.a_venda and not coalesce(old.a_venda, false) then raise exception '% anunciou a aposentadoria: não vai à lista de transferência.', old.nome; end if;
  end if;
  if v_estende and new.clube_id is not distinct from old.clube_id and old.pre_contrato is not distinct from v_temp and old.pre_contrato is not null then
    raise exception '% já recebeu proposta de pré-contrato de outro clube: não dá mais para renovar com ele.', old.nome;
  end if;
  if v_estende then
    if new.idade >= 33 then new.contrato_ate := least(new.contrato_ate, v_temp + 1); end if;       -- 33 ou mais: só até o fim da temporada seguinte
    new.contrato_ate := least(new.contrato_ate, v_temp + greatest(0, 37 - new.idade));             -- ninguém assina para a temporada em que teria 38
  end if;
  return new;
end $$;
drop trigger if exists guardas_do_jogador on public.jogadores;
create trigger guardas_do_jogador before update on public.jogadores for each row execute function public.guardas_do_jogador();

-- A virada chamada com as guardas desligadas; também limpa as datas das janelas da temporada que acabou. Só administrador (conferido dentro de virar_temporada).
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_texto text;
begin
  perform set_config('trem.virada', '1', true);
  v_texto := virar_temporada(p_liga, p_plano);
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null where id = p_liga;
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;

-- ---------- 4. pré-acordo entre dirigentes ----------
create or replace function public.fazer_proposta(p_jogador bigint, p_valor int, p_salario int, p_temporadas int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_teto int; v_id bigint; v_trava text;
begin
  select * into v_para from clubes where dono = auth.uid();
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null or v_j.clube_id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.dono is null then raise exception 'Clube sem dono não negocia: dele, só pela multa rescisória.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  if v_j.aposenta_em is not null then raise exception 'Esse jogador anunciou a aposentadoria: não pode mais ser negociado.'; end if;
  if janela_do_mercado(v_l.id) is null then
    if not periodo_de_pre_acordo(v_l.id) then raise exception 'O mercado está fechado: propostas só com a janela aberta ou, depois da última rodada, como pré-acordo.'; end if;
    if v_j.idade >= 37 then raise exception 'Esse jogador chega à idade limite na virada: não entra em pré-acordo.'; end if;
  end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da proposta.'; end if;
  v_trava := trava_da_negociacao(p_jogador, v_para.id, p_valor);
  if v_trava is not null then raise exception 'Proposta recusada pelas regras: %.', v_trava; end if;
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

create or replace function public.fechar_negocio(p_proposta bigint, p_valor int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_p propostas%rowtype;
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_janela text; v_trava text;
  v_teto int; v_folha int; v_jogos int; v_taxa int;
begin
  select * into v_p from propostas where id = p_proposta for update;
  select * into v_j from jogadores where id = v_p.jogador_id for update;
  if v_j.id is null or v_j.clube_id is distinct from v_p.vendedor then raise exception 'O jogador não está mais nesse clube.'; end if;
  select * into v_de from clubes where id = v_p.vendedor;
  select * into v_para from clubes where id = v_p.comprador;
  select * into v_l from ligas where id = v_p.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  -- depois da última rodada e antes da virada: o aceite vira pré-acordo, que não se desfaz e é executado na virada
  if v_janela is null and periodo_de_pre_acordo(v_l.id) then
    update propostas set estado = 'pre', valor = p_valor, atualizada_em = now() where id = p_proposta;
    return 'Pré-acordo fechado: o negócio acontece na virada da temporada.';
  end if;
  if v_janela is null then raise exception 'O mercado está fechado: o negócio só fecha com a janela aberta.'; end if;
  v_trava := trava_da_negociacao(v_j.id, v_para.id, p_valor);
  if v_trava is not null then raise exception 'O negócio não pode ser fechado: %.', v_trava; end if;
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
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor, taxa, salario_antes, contrato_antes, protegido_ate_antes)
    values (v_l.id, v_l.temporada, v_janela, 'negociada', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, p_valor, v_taxa, v_j.salario, v_j.contrato_ate, v_j.protegido_ate);
  return v_j.nome || ' vendido por ' || p_valor || ' mil (taxa de ' || v_taxa || ' mil).';
end $$;
revoke execute on function public.fechar_negocio(bigint, int) from public, anon, authenticated;

-- ---------- 5. pré-contrato ----------
create table if not exists public.pre_contratos (
  jogador_id bigint not null references public.jogadores on delete cascade,
  clube_id bigint not null references public.clubes on delete cascade,
  temporada int not null,       -- temporada em que a proposta foi feita (vale para a seguinte)
  salario int not null,
  temporadas int not null,
  criada_em timestamptz not null default now(),
  primary key (jogador_id, clube_id)
);
alter table public.pre_contratos enable row level security;
drop policy if exists pre_contratos_ler on public.pre_contratos;
create policy pre_contratos_ler on public.pre_contratos for select to authenticated using (clube_id in (select id from clubes where dono = auth.uid()));

create or replace function public.propor_pre_contrato(p_jogador bigint, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_j jogadores%rowtype; v_de clubes%rowtype; v_l ligas%rowtype; v_min int;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if not periodo_de_pre_acordo(v_l.id) then raise exception 'Pré-contrato só entre a última rodada da liga e a virada da temporada.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.clube_id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_c.id then raise exception 'Esse jogador já é seu: renove o contrato dele.'; end if;
  if v_de.liga_id <> v_c.liga_id then raise exception 'O jogador é de outra liga.'; end if;
  if v_de.dono is null then raise exception 'Pré-contrato só com jogador de clube com dirigente: os clubes sem dono renovam sozinhos.'; end if;
  if v_j.contrato_ate is not null and v_j.contrato_ate > v_l.temporada then raise exception 'O contrato dele não acaba nesta temporada.'; end if;
  if v_j.aposenta_em is not null then raise exception 'Esse jogador anunciou a aposentadoria.'; end if;
  if v_j.idade >= 37 then raise exception 'Esse jogador chega à idade limite na virada.'; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  v_min := coalesce(v_j.salario_mercado, v_j.salario, 0);
  if p_salario is null or p_salario < v_min then raise exception 'Ele pede pelo menos % mil por temporada.', v_min; end if;
  if not exists (select 1 from pre_contratos where jogador_id = p_jogador and clube_id = v_c.id)
     and (select count(*) from pre_contratos where clube_id = v_c.id and temporada = v_l.temporada) >= 2 then
    raise exception 'Você já fez 2 propostas de pré-contrato nesta temporada.';
  end if;
  insert into pre_contratos (jogador_id, clube_id, temporada, salario, temporadas) values (p_jogador, v_c.id, v_l.temporada, p_salario, p_temporadas)
    on conflict (jogador_id, clube_id) do update set salario = excluded.salario, temporadas = excluded.temporadas, temporada = excluded.temporada, criada_em = now();
  perform set_config('trem.virada', '1', true); -- marcar o jogador não é renovação nem venda: passa pelas guardas
  update jogadores set pre_contrato = v_l.temporada where id = p_jogador;
  perform set_config('trem.virada', '', true);
  return 'Proposta de pré-contrato registrada. Se ' || v_j.nome || ' ficar livre na virada, vai para quem ofereceu o maior salário.';
end $$;
revoke execute on function public.propor_pre_contrato(bigint, int, int) from public, anon;
grant execute on function public.propor_pre_contrato(bigint, int, int) to authenticated;

-- Depois da virada (e de liberar os jogadores sem contrato): executa os pré-acordos e resolve os pré-contratos. Só administrador.
create or replace function public.executar_pre_acordos(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare p record; j record; o record; v_temp int; v_ok int := 0; v_falhou int := 0; v_pre int := 0;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  for p in select id, valor from propostas where liga_id = p_liga and estado = 'pre' order by atualizada_em, id loop
    begin
      perform fechar_negocio(p.id, p.valor);
      v_ok := v_ok + 1;
    exception when others then
      update propostas set estado = 'cancelada', motivo = 'Pré-acordo não executado na virada: ' || sqlerrm, atualizada_em = now() where id = p.id;
      v_falhou := v_falhou + 1;
    end;
  end loop;
  for j in select x.id, x.idade from jogadores x where x.clube_id is null and x.livre_liga = p_liga
            and exists (select 1 from pre_contratos c where c.jogador_id = x.id and c.temporada = v_temp - 1) loop
    for o in select * from pre_contratos where jogador_id = j.id and temporada = v_temp - 1 order by salario desc, criada_em loop
      if impedimento_de_contrato(o.clube_id, o.salario) is null and vaga_no_elenco(o.clube_id, j.idade) is null then
        perform contratar_livre(j.id, o.clube_id, o.salario, o.temporadas);
        v_pre := v_pre + 1;
        exit;
      end if;
    end loop;
  end loop;
  delete from pre_contratos where clube_id in (select id from clubes where liga_id = p_liga) and temporada < v_temp;
  perform set_config('trem.virada', '1', true);
  update jogadores set pre_contrato = null where pre_contrato is not null and (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga);
  perform set_config('trem.virada', '', true);
  return v_ok || ' pré-acordos executados, ' || v_falhou || ' cancelados, ' || v_pre || ' pré-contratos assinados.';
end $$;
revoke execute on function public.executar_pre_acordos(bigint) from public, anon;
grant execute on function public.executar_pre_acordos(bigint) to authenticated;
