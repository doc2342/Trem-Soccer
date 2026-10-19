-- Trem Soccer · dispensa com multa (22 a 30 anos), venda negociada de juvenil a partir dos 18 e parte do formador pelas temporadas de formação.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 132_estadio_real.sql. Não exige republicar função. Pode ser executado mais de uma vez.
--
-- 1. Dispensa: até 21 anos e de 31 em diante continua grátis. De 22 a 30 passa a ser permitida pagando 50% do salário que falta
--    até o fim do contrato (o que falta da temporada atual, pelas rodadas de salário já pagas, mais as temporadas seguintes).
-- 2. Juvenil de 18 anos ou mais pode ser vendido por proposta aceita (nunca pela multa, nunca em pré-acordo). A faixa de valor é a de
--    sempre (60% a 150% da multa), calculada sobre o salário de mercado dele. O comprador paga o salário da proposta: ele chega profissional.
-- 3. Clube formador: em vez de 5% fixos, 3% por temporada de formação no clube (mínimo 3%, máximo 15%). Conta da chegada à base até a
--    saída do clube formador; empréstimo não conta como saída.

-- ---------- 1: dispensa com multa ----------
create or replace function public.multa_da_dispensa(p_jogador bigint) returns int
language sql stable security definer set search_path = public as $$
  select case when j.idade between 22 and 30 and j.salario is not null and j.contrato_ate is not null then
    greatest(0, round(0.5 * j.salario * ((j.contrato_ate - l.temporada) + 1 - least(1,
      (select count(*) from lancamentos x where x.clube_id = j.clube_id and x.temporada = l.temporada and x.tipo = 'salarios')::numeric / l.rodadas_por_temporada))))::int
    else 0 end
  from jogadores j join clubes c on c.id = j.clube_id join ligas l on l.id = c.liga_id where j.id = p_jogador
$$;
grant execute on function public.multa_da_dispensa(bigint) to authenticated;

create or replace function public.dispensar_jogador(p_jogador bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_c clubes%rowtype; v_multa int; v_temp int;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if (select count(*) from jogadores where clube_id = v_c.id) <= 16 then raise exception 'O elenco não pode ficar com menos de 16 jogadores.'; end if;
  if exists (select 1 from partidas p where (p.casa = v_c.id or p.fora = v_c.id) and p.processada and p.fim > now()) then
    raise exception 'Há uma partida do seu clube em andamento. Dispense depois do apito final.';
  end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  v_multa := multa_da_dispensa(p_jogador);
  if v_multa > 0 then
    if coalesce((select caixa from financas where clube_id = v_c.id for update), 0) < v_multa then
      raise exception 'Caixa insuficiente: a rescisão de % custa % mil.', v_j.nome, v_multa;
    end if;
    update financas set caixa = caixa - v_multa where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_temp, null, 'rescisao', -v_multa, 'Rescisão de contrato (50% do salário que faltava): ' || v_j.nome);
  end if;
  update jogadores set clube_id = null, livre_liga = v_c.liga_id, livre_ate = null, livre_inicio = null, livre_abriu = null,
      salario = null, salario_mercado = coalesce(v_j.salario_mercado, v_j.salario), contrato_ate = null,
      protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null, treino = null,
      dispensado_por = v_c.id, dispensado_temporada = v_temp
    where id = p_jogador;
  return v_j.nome || ' dispensado' || case when v_multa > 0 then ' (rescisão de ' || v_multa || ' mil)' else '' end
    || ': está livre e pode ser contratado por qualquer outro clube.';
end $$;

-- ---------- 3 (antes do 2, porque o 2 usa): temporadas de formação ----------
alter table public.jogadores add column if not exists formado_desde int; -- temporada em que chegou à base do clube formador
alter table public.jogadores add column if not exists formado_ate int;   -- temporada em que saiu do clube formador (vazio: ainda está lá)

create or replace function public.anotar_formacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_temp int;
begin
  if new.formador is null then return new; end if;
  select l.temporada into v_temp from ligas l join clubes c on c.liga_id = l.id where c.id = new.formador;
  if tg_op = 'INSERT' then
    -- na virada o jovem começa a jogar na temporada seguinte, que ainda não foi aberta
    if new.formado_desde is null then new.formado_desde := v_temp + case when current_setting('trem.virada', true) = '1' then 1 else 0 end; end if;
  elsif old.clube_id = new.formador and new.clube_id is distinct from old.clube_id
        and new.emprestado_de is distinct from old.clube_id and new.formado_ate is null then
    -- ponytail: vale a primeira saída; quem volta (repatriado) não volta a contar temporadas
    new.formado_ate := v_temp;
  end if;
  return new;
end $$;
drop trigger if exists anotar_formacao on public.jogadores;
create trigger anotar_formacao before insert or update of clube_id on public.jogadores for each row execute function public.anotar_formacao();

-- quem já está na liga: chegada pela safra (pelo nome) ou, sem ela, estimada pela idade (a base revela aos 16–18)
update public.jogadores j set formado_desde = coalesce(
    (select min(s.temporada) from safras s where s.clube_id = j.formador and s.jogador = j.nome),
    l.temporada - greatest(0, j.idade - 17))
  from public.clubes c join public.ligas l on l.id = c.liga_id
  where c.id = j.formador and j.formado_desde is null;
update public.jogadores j set formado_ate = (select min(t.temporada) from transferencias t where t.jogador_id = j.id and t.de_clube = j.formador)
  where j.formador is not null and j.formado_ate is null and j.clube_id is distinct from j.formador and j.emprestado_de is distinct from j.formador;

create or replace function public.parte_do_formador(p_jogador bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select least(0.15, 0.03 * greatest(1, coalesce(j.formado_ate, l.temporada) - coalesce(j.formado_desde, l.temporada)))
  from jogadores j join clubes c on c.id = j.formador join ligas l on l.id = c.liga_id where j.id = p_jogador
$$;
grant execute on function public.parte_do_formador(bigint) to anon, authenticated;

-- repassar_ao_formador: igual à do 62_selecao_safra_e_devolucao.sql, com a parte por temporadas de formação
create or replace function public.repassar_ao_formador() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_f bigint; v_v int; v_pct int;
begin
  if new.jogador_id is null or new.de_clube is null or coalesce(new.valor, 0) <= 0 then return new; end if;
  select formador into v_f from jogadores where id = new.jogador_id;
  if v_f is null or v_f = new.de_clube or v_f is not distinct from new.para_clube then return new; end if;
  v_pct := round(100 * parte_do_formador(new.jogador_id));
  v_v := round(new.valor * v_pct / 100.0);
  if v_v <= 0 then return new; end if;
  update financas set caixa = caixa - v_v where clube_id = new.de_clube;
  update financas set caixa = caixa + v_v where clube_id = v_f;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (new.de_clube, new.temporada, null, 'formador', -v_v, 'Repasse de ' || v_pct || '% ao clube formador: ' || new.jogador),
    (v_f, new.temporada, null, 'formador', v_v, 'Clube formador: ' || v_pct || '% da venda de ' || new.jogador);
  new.formador_clube := v_f; new.formador_valor := v_v;
  return new;
end $$;

-- devolver_ao_vendedor: igual à do 62, só o texto deixa de dizer 5%
create or replace function public.devolver_ao_vendedor() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if (select count(*) from antigas) <> 1 then return null; end if;
  select * into t from antigas;
  if coalesce(t.formador_valor, 0) > 0 and t.formador_clube is not null and t.de_clube is not null
     and exists (select 1 from clubes where id = t.formador_clube) and exists (select 1 from clubes where id = t.de_clube) then
    update financas set caixa = caixa + t.formador_valor where clube_id = t.de_clube;
    update financas set caixa = caixa - t.formador_valor where clube_id = t.formador_clube;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (t.de_clube, t.temporada, null, 'formador', t.formador_valor, 'Transferência anulada: volta o repasse ao clube formador de ' || t.jogador),
      (t.formador_clube, t.temporada, null, 'formador', -t.formador_valor, 'Transferência anulada: devolução do repasse de ' || t.jogador);
  end if;
  return null;
end $$;

-- ---------- 2: venda negociada de juvenil a partir dos 18 ----------
-- trava_da_negociacao: igual à do 22_travas_da_negociacao.sql; juvenil usa o salário de mercado como base da faixa
create or replace function public.trava_da_negociacao(p_jogador bigint, p_comprador bigint, p_valor int) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_l ligas%rowtype;
  v_agora int; v_base int;
begin
  select * into v_j from jogadores where id = p_jogador;
  select l.* into v_l from clubes c join ligas l on l.id = c.liga_id where c.id = p_comprador;
  if coalesce(v_j.juvenil, false) then
    if v_j.idade < 18 then return 'juvenil só pode ser negociado a partir dos 18 anos'; end if;
    if janela_do_mercado(v_l.id) is null then return 'juvenil só é negociado com a janela aberta, não em pré-acordo'; end if;
    v_base := v_j.salario_mercado;
  else v_base := v_j.salario;
  end if;
  if v_base is null then return 'o jogador não tem contrato definido'; end if;
  if p_valor < 3 * v_base then return 'o valor mínimo é de ' || 3 * v_base || ' mil (60% da multa rescisória)'; end if;
  if p_valor > round(7.5 * v_base) then return 'o valor máximo é de ' || round(7.5 * v_base) || ' mil (150% da multa rescisória)'; end if;
  if exists (select 1 from transferencias t where t.liga_id = v_l.id and t.temporada = v_l.temporada and t.tipo = 'negociada'
      and t.de_clube = v_j.clube_id and t.para_clube = p_comprador) then
    return 'esse clube já vendeu um jogador ao seu nesta temporada (é um negócio por temporada em cada sentido)';
  end if;
  v_agora := indice_da_janela(v_l.temporada, janela_do_mercado(v_l.id));
  if v_j.chegou_temporada is not null and indice_da_janela(v_j.chegou_temporada, v_j.chegou_janela) = v_agora then
    return 'o jogador chegou ao clube nesta janela: só pode ser vendido a partir da próxima';
  end if;
  if exists (select 1 from transferencias t where t.jogador_id = p_jogador and t.de_clube = p_comprador
      and v_agora - indice_da_janela(t.temporada, t.janela) <= 2) then
    return 'o jogador saiu desse clube há pouco: ele só pode voltar depois de duas janelas';
  end if;
  return null;
end $$;
grant execute on function public.trava_da_negociacao(bigint, bigint, int) to authenticated;

-- guardas_da_base: igual à do 60_juvenis_e_formador.sql; o juvenil de 18+ muda de clube quando chega profissionalizado (venda negociada)
create or replace function public.guardas_da_base() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_temp int;
begin
  if coalesce(old.juvenil, false) then
    if new.clube_id is null then new.juvenil := false; -- saiu do clube (dispensa ou virada): passa a ser um jogador livre comum
    elsif new.clube_id is distinct from old.clube_id and (coalesce(new.juvenil, false) or new.salario is null or old.idade < 18) then
      raise exception '% é juvenil, sem contrato: só muda de clube por venda negociada, a partir dos 18 anos.', old.nome;
    end if;
    if coalesce(new.a_venda, false) and not coalesce(old.a_venda, false) then raise exception '% é juvenil: profissionalize antes de pôr à venda.', old.nome; end if;
    if coalesce(new.protegido, false) and not coalesce(old.protegido, false) then raise exception '% é juvenil: já não tem multa rescisória.', old.nome; end if;
  end if;
  if new.pre_contrato is not null and new.pre_contrato is distinct from old.pre_contrato
     and (coalesce(old.juvenil, false) or (old.formador is not null and old.formador = old.clube_id and old.idade <= 21)) then
    raise exception '% foi formado no clube e tem até 21 anos: não aceita pré-contrato.', old.nome;
  end if;
  -- formado no clube: a multa só passa a valer na temporada em que ele faz 22
  if new.clube_id is not null and new.clube_id is not distinct from old.clube_id and new.formador = new.clube_id and new.idade <= 21
     and (new.protegido_ate is distinct from old.protegido_ate or new.contrato_ate is distinct from old.contrato_ate) then
    select l.temporada into v_temp from ligas l join clubes c on c.liga_id = l.id where c.id = new.clube_id;
    if v_temp is not null then new.protegido_ate := greatest(coalesce(new.protegido_ate, 0), v_temp + 21 - new.idade); end if;
  end if;
  return new;
end $$;

-- fechar_negocio: igual à do 76_emprestimo_e_supercopa.sql; o juvenil vendido chega profissional, com o contrato da proposta
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
  if v_janela is null and periodo_de_pre_acordo(v_l.id) and not coalesce(v_j.juvenil, false) then
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
  v_folha := folha_do_clube(v_para.id);
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
  update jogadores set clube_id = v_para.id, salario = v_p.salario, contrato_ate = v_l.temporada + v_p.temporadas, juvenil = false,
    salario_mercado = coalesce(salario_mercado, v_p.salario),
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada, chegou_janela = v_janela
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor, taxa, salario_antes, contrato_antes, protegido_ate_antes)
    values (v_l.id, v_l.temporada, v_janela, 'negociada', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, p_valor, v_taxa, v_j.salario, v_j.contrato_ate, v_j.protegido_ate);
  return v_j.nome || ' vendido por ' || p_valor || ' mil (taxa de ' || v_taxa || ' mil).';
end $$;
