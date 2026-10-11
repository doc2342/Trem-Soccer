-- Trem Soccer · empréstimo de jogadores e Supercopa.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 75_transmissao_em_blocos.sql já executado. Depois, republicar a função "rodada". Pode ser executado mais de uma vez.
--
-- EMPRÉSTIMO
-- - Só com a janela aberta, até a virada da temporada (na virada todo mundo volta para casa antes de qualquer outra coisa).
-- - Jogador de até 23 anos, com contrato que passa desta temporada; juvenil não sai por empréstimo.
-- - Cada clube empresta no máximo 2 e recebe no máximo 2 por temporada. Clube sem dirigente não empresta.
-- - O salário fica meio a meio: cada clube paga metade a cada rodada, e metade conta na folha (e no teto) de cada um.
-- - Entre dirigentes: quem quer o jogador pede (pedir_emprestimo); o pedido aparece nas Negociações do dono, que aceita ou recusa.
-- - Para clube sem dirigente: o dono oferece (emprestar_a_bot) e o clube responde na hora: só aceita quem chega para ser titular.
-- - Emprestado não é vendido, comprado pela multa, listado, dispensado nem renovado: uma guarda só, na tabela, vale para todos os caminhos.
-- - O emprestado ocupa vaga entre os 30 dos dois clubes (no de origem, para ter lugar quando voltar).
--
-- SUPERCOPA
-- - Campeão da Série A x campeão da Copa do Brasil da temporada anterior (se for o mesmo clube, entra o vice da Série A).
-- - É um jogo de copa com copa_fase = 0, criado pela página do administrador junto com o calendário: campo neutro no estádio maior,
--   prorrogação e pênaltis, renda meio a meio. Não paga prêmio. O campeão fica em historico.supercopa.

alter table public.jogadores add column if not exists emprestado_de bigint references public.clubes on delete set null; -- clube dono do jogador enquanto ele está emprestado
create index if not exists jogadores_emprestado_de on public.jogadores (emprestado_de) where emprestado_de is not null;
alter table public.propostas add column if not exists emprestimo boolean not null default false; -- pedido de empréstimo (valor 0)
alter table public.historico add column if not exists supercopa boolean;                         -- ganhou a Supercopa disputada nesta temporada

-- ---------- folha: o emprestado conta metade em cada clube ----------
create or replace function public.folha_do_clube(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(salario * case when emprestado_de is null then 1 else 0.5 end)), 0)::int
    from jogadores where clube_id = p_clube or emprestado_de = p_clube
$$;

-- ---------- vaga no elenco: quem está emprestado guarda o lugar no clube de origem ----------
create or replace function public.vaga_no_elenco(p_clube bigint, p_idade int) returns text
language sql stable security definer set search_path = public as $$
  select case
    when (select count(*) from jogadores where (clube_id = p_clube or emprestado_de = p_clube) and not coalesce(juvenil, false)) >= 30 then 'o elenco já tem 30 jogadores com contrato'
    else null end
$$;

create or replace function public.conferir_vaga_no_elenco() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if tg_op = 'UPDATE' then -- volta do empréstimo: o lugar já era dele
    if old.emprestado_de is not null and new.clube_id is not distinct from old.emprestado_de then return new; end if;
  end if;
  if new.clube_id is not null and (tg_op = 'INSERT' or new.clube_id is distinct from old.clube_id) then
    if coalesce(new.juvenil, false) then
      if (select count(*) from jogadores where clube_id = new.clube_id and juvenil) >= 25 then raise exception 'O clube já tem 25 juvenis.'; end if;
    else
      v_motivo := vaga_no_elenco(new.clube_id, new.idade);
      if v_motivo is not null then raise exception 'Não dá para trazer %: % de destino.', new.nome, v_motivo; end if;
    end if;
  end if;
  return new;
end $$;

-- ---------- guarda do emprestado ----------
create or replace function public.guardas_do_emprestimo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.emprestado_de is not null and coalesce(current_setting('trem.virada', true), '') <> '1' and not public.eh_admin() then
      raise exception '% está emprestado: não pode ser dispensado.', old.nome;
    end if;
    return old;
  end if;
  if old.emprestado_de is null or new.emprestado_de is null then return new; end if; -- não está emprestado, ou está voltando
  if new.clube_id is distinct from old.clube_id then raise exception '% está emprestado até a virada da temporada: não muda de clube.', old.nome; end if;
  if new.salario is distinct from old.salario or new.contrato_ate is distinct from old.contrato_ate then raise exception '% está emprestado: o contrato dele só muda depois que voltar.', old.nome; end if;
  if coalesce(new.a_venda, false) and not coalesce(old.a_venda, false) then raise exception '% está emprestado: não vai à lista de transferência.', old.nome; end if;
  if coalesce(new.protegido, false) and not coalesce(old.protegido, false) then raise exception '% está emprestado: não entra na lista de protegidos.', old.nome; end if;
  return new;
end $$;
drop trigger if exists guardas_do_emprestimo on public.jogadores;
create trigger guardas_do_emprestimo before update or delete on public.jogadores for each row execute function public.guardas_do_emprestimo();

-- ---------- regras ----------
-- O jogador pode ir por empréstimo para esse clube agora? Devolve o motivo de não poder, ou nulo.
create or replace function public.trava_do_emprestimo(p_jogador bigint, p_destino bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_de clubes%rowtype; v_para clubes%rowtype; v_l ligas%rowtype; v_motivo text;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null or v_j.clube_id is null then return 'jogador não encontrado'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  select * into v_para from clubes where id = p_destino;
  if v_para.id is null or v_para.liga_id is distinct from v_de.liga_id or v_para.id = v_de.id then return 'o destino tem de ser outro clube da mesma liga'; end if;
  if v_j.emprestado_de is not null then return v_j.nome || ' já está emprestado'; end if;
  if v_de.dono is null then return 'clube sem dirigente não empresta jogador'; end if;
  select * into v_l from ligas where id = v_de.liga_id;
  if janela_do_mercado(v_l.id) is null then return 'o mercado está fechado, e empréstimo só sai com a janela aberta'; end if;
  if coalesce(v_j.juvenil, false) then return 'juvenil não sai por empréstimo (profissionalize antes)'; end if;
  if v_j.idade > 23 then return 'empréstimo é só para jogador de até 23 anos'; end if;
  if v_j.salario is null or v_j.contrato_ate is null or v_j.contrato_ate <= v_l.temporada then return 'o contrato dele acaba nesta temporada (renove antes de emprestar)'; end if;
  if (select count(*) from jogadores where emprestado_de = v_de.id) >= 2 then return v_de.nome || ' já emprestou 2 jogadores nesta temporada'; end if;
  if (select count(*) from jogadores where clube_id = v_para.id and emprestado_de is not null) >= 2 then return v_para.nome || ' já recebeu 2 jogadores por empréstimo nesta temporada'; end if;
  if (select count(*) from jogadores where clube_id = v_de.id and not coalesce(juvenil, false)) <= 16 then return v_de.nome || ' não pode ficar com menos de 16 jogadores com contrato'; end if;
  v_motivo := vaga_no_elenco(v_para.id, v_j.idade);
  if v_motivo is not null then return v_motivo || ' no ' || v_para.nome; end if;
  if folha_do_clube(v_para.id) + round(v_j.salario / 2.0) > teto_do_clube(v_para.id) then return 'a folha do ' || v_para.nome || ' passaria do teto com a metade do salário dele'; end if;
  return null;
end $$;

-- Faz o empréstimo. Só as funções abaixo chamam.
create or replace function public.executar_emprestimo(p_jogador bigint, p_destino bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_trava text; v_nome text;
begin
  select * into v_j from jogadores where id = p_jogador for update;
  v_trava := trava_do_emprestimo(p_jogador, p_destino);
  if v_trava is not null then raise exception 'O empréstimo não pode ser feito: %.', v_trava; end if;
  update jogadores set emprestado_de = clube_id, clube_id = p_destino, principal = false, protegido = false where id = p_jogador;
  -- a troca de clube refaz a "janela de chegada"; no empréstimo ela fica como estava (é ela que define a taxa de venda quando ele voltar)
  update jogadores set chegou_temporada = v_j.chegou_temporada, chegou_janela = v_j.chegou_janela where id = p_jogador;
  select nome into v_nome from clubes where id = p_destino;
  return v_j.nome || ' emprestado ao ' || v_nome || ' até a virada da temporada. O salário fica meio a meio.';
end $$;
revoke execute on function public.executar_emprestimo(bigint, bigint) from public, anon, authenticated;

-- Todos os emprestados da liga voltam para o clube de origem. Só a virada chama.
create or replace function public.devolver_emprestados(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, emprestado_de, chegou_temporada, chegou_janela from jogadores
           where emprestado_de in (select id from clubes where liga_id = p_liga) loop
    update jogadores set clube_id = r.emprestado_de, emprestado_de = null, principal = false where id = r.id;
    update jogadores set chegou_temporada = r.chegou_temporada, chegou_janela = r.chegou_janela where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.devolver_emprestados(bigint) from public, anon, authenticated;

-- Dirigente pede emprestado um jogador de outro dirigente. O pedido vai para as Negociações do dono.
create or replace function public.pedir_emprestimo(p_jogador bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_para clubes%rowtype; v_j jogadores%rowtype; v_l ligas%rowtype; v_trava text; v_id bigint;
begin
  select * into v_para from clubes where dono = auth.uid();
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null or v_j.clube_id is null then raise exception 'Jogador não encontrado.'; end if;
  if v_j.clube_id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  v_trava := trava_do_emprestimo(p_jogador, v_para.id);
  if v_trava is not null then raise exception 'Pedido recusado pelas regras: %.', v_trava; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  update propostas set estado = 'cancelada', motivo = 'Substituído por um pedido novo.', atualizada_em = now()
    where jogador_id = p_jogador and comprador = v_para.id and emprestimo and estado = 'pendente';
  insert into propostas (liga_id, temporada, jogador_id, comprador, vendedor, valor, salario, temporadas, emprestimo)
    values (v_l.id, v_l.temporada, p_jogador, v_para.id, v_j.clube_id, 0, round(v_j.salario / 2.0), 0, true) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.pedir_emprestimo(bigint) from public, anon;
grant execute on function public.pedir_emprestimo(bigint) to authenticated;

-- Dirigente oferece um jogador seu a um clube sem dirigente, que responde na hora.
create or replace function public.emprestar_a_bot(p_jogador bigint, p_clube bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_de clubes%rowtype; v_para clubes%rowtype; v_j jogadores%rowtype; v_melhores int;
begin
  select * into v_de from clubes where dono = auth.uid();
  if v_de.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null or v_j.clube_id is distinct from v_de.id then raise exception 'Esse jogador não é seu.'; end if;
  select * into v_para from clubes where id = p_clube;
  if v_para.id is null or v_para.dono is not null then raise exception 'Este caminho é só para clube sem dirigente. Com dirigente, é ele quem pede o empréstimo, na página do jogador.'; end if;
  -- O clube sem dirigente só aceita quem chega para ser titular: ninguém melhor na posição (até um, onde jogam dois).
  -- ponytail: a força é medida pelo salário de mercado gravado (refeito na virada), sem o desconto de idade; se ficar injusto
  -- com quem cresceu no meio da temporada, levar a decisão para a função "rodada", que calcula a nota de verdade.
  select count(*) into v_melhores from jogadores x
    where x.clube_id = v_para.id and x.pos = v_j.pos
      and coalesce(x.salario_mercado, x.salario, 0) / (case when x.idade <= 21 then 0.8 when x.idade >= 31 then 0.9 else 1 end)
       >= coalesce(v_j.salario_mercado, v_j.salario, 0) / (case when v_j.idade <= 21 then 0.8 when v_j.idade >= 31 then 0.9 else 1 end);
  if v_melhores >= case when v_j.pos in ('DC', 'MC', 'FC') then 2 else 1 end then
    raise exception 'O % não quer % por empréstimo: já tem jogador igual ou melhor na posição dele, e clube sem dirigente só recebe quem chega para ser titular.', v_para.nome, v_j.nome;
  end if;
  return executar_emprestimo(p_jogador, p_clube);
end $$;
revoke execute on function public.emprestar_a_bot(bigint, bigint) from public, anon;
grant execute on function public.emprestar_a_bot(bigint, bigint) to authenticated;

-- A resposta do dono, igual à do 22_travas_da_negociacao.sql, agora com o pedido de empréstimo (aceitar ou recusar).
create or replace function public.responder_proposta(p_id bigint, p_acao text, p_valor int default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_p propostas%rowtype; v_trava text; v_texto text;
begin
  select * into v_p from propostas where id = p_id;
  if v_p.id is null or not exists (select 1 from clubes where id = v_p.vendedor and dono = auth.uid()) then raise exception 'Essa proposta não é para o seu clube.'; end if;
  if v_p.estado <> 'pendente' then raise exception 'Essa proposta não está mais aguardando a sua resposta.'; end if;
  if v_p.emprestimo and p_acao = 'aceitar' then
    if not exists (select 1 from jogadores where id = v_p.jogador_id and clube_id = v_p.vendedor) then raise exception 'O jogador não está mais no seu clube.'; end if;
    v_texto := executar_emprestimo(v_p.jogador_id, v_p.comprador); -- a troca de clube encerra as outras propostas abertas por ele
    update propostas set estado = 'aceita', motivo = null, atualizada_em = now() where id = p_id;
    return v_texto;
  elsif v_p.emprestimo and p_acao = 'contrapropor' then raise exception 'Pedido de empréstimo não tem contraproposta: aceite ou recuse.';
  end if;
  if p_acao = 'aceitar' then return fechar_negocio(p_id, v_p.valor);
  elsif p_acao = 'recusar' then update propostas set estado = 'recusada', atualizada_em = now() where id = p_id; return 'Proposta recusada.';
  elsif p_acao = 'contrapropor' then
    if p_valor is null or p_valor <= v_p.valor then raise exception 'A contraproposta precisa ser maior que o valor oferecido.'; end if;
    v_trava := trava_da_negociacao(v_p.jogador_id, v_p.comprador, p_valor);
    if v_trava is not null then raise exception 'Contraproposta recusada pelas regras: %.', v_trava; end if;
    update propostas set estado = 'contra', contra_valor = p_valor, atualizada_em = now() where id = p_id;
    return 'Contraproposta enviada.';
  end if;
  raise exception 'Resposta desconhecida.';
end $$;

-- ---------- a virada: devolve os emprestados antes de tudo e anota o campeão da Supercopa ----------
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_texto text; v_temporada int; v_copa jsonb; v_super bigint;
begin
  select temporada into v_temporada from ligas where id = p_liga;
  v_copa := copa_campanhas(p_liga); -- antes da virada, que apaga as partidas
  select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) into v_super
    from partidas p join resultados r on r.partida_id = p.id
    where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = 0 limit 1;
  perform set_config('trem.virada', '1', true);
  perform devolver_emprestados(p_liga); -- o plano da virada já foi montado com cada emprestado no clube de origem
  v_texto := virar_temporada(p_liga, p_plano);
  if v_copa <> '{}'::jsonb then
    update historico h set copa = v_copa->>h.clube_id::text
      where h.liga_id = p_liga and h.temporada = v_temporada and v_copa ? h.clube_id::text;
  end if;
  if v_super is not null then
    update historico set supercopa = true where liga_id = p_liga and temporada = v_temporada and clube_id = v_super;
  end if;
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null, copa = null where id = p_liga;
  update jogadores set amarelos_copa = null, fora_copa = null, copa_clube = null
    where (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga)
      and (amarelos_copa is not null or fora_copa is not null or copa_clube is not null);
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;

-- ---------- funções que somam a folha: cópias das atuais, com o emprestado contando metade ----------
-- impedimento_de_contrato: igual à do 21_jogadores_livres.sql, com a folha somada por folha_do_clube
create or replace function public.impedimento_de_contrato(p_clube bigint, p_salario int) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_teto int; v_folha int;
begin
  v_teto := teto_do_clube(p_clube);
  if p_salario > v_teto * 0.15 then return 'um jogador não pode ganhar mais de 15% do teto de folha'; end if;
  v_folha := folha_do_clube(p_clube);
  if v_folha + p_salario > v_teto then return 'a folha passaria do teto'; end if;
  if (select count(*) from jogadores where clube_id = p_clube) >= 50 then return 'o elenco já tem 50 jogadores'; end if;
  return null;
end $$;

-- fechar_negocio: igual à do 46_janelas_aposentadoria_e_pre_acordo.sql, com a folha somada por folha_do_clube
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
  update jogadores set clube_id = v_para.id, salario = v_p.salario, contrato_ate = v_l.temporada + v_p.temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada, chegou_janela = v_janela
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor, taxa, salario_antes, contrato_antes, protegido_ate_antes)
    values (v_l.id, v_l.temporada, v_janela, 'negociada', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, p_valor, v_taxa, v_j.salario, v_j.contrato_ate, v_j.protegido_ate);
  return v_j.nome || ' vendido por ' || p_valor || ' mil (taxa de ' || v_taxa || ' mil).';
end $$;

-- profissionalizar_jogador: igual à do 60_juvenis_e_formador.sql, com a folha somada por folha_do_clube
create or replace function public.profissionalizar_jogador(p_user uuid, p_jogador bigint, p_mercado int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_j jogadores%rowtype; v_l ligas%rowtype; v_sal int; v_teto int; v_folha int; v_ate int;
begin
  select * into v_c from clubes where dono = p_user;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  select * into v_j from jogadores where id = p_jogador and clube_id = v_c.id for update;
  if v_j.id is null then raise exception 'Esse jogador não é do seu clube.'; end if;
  if not coalesce(v_j.juvenil, false) then raise exception '% já é profissional.', v_j.nome; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if coalesce(p_mercado, 0) <= 0 then raise exception 'Salário de mercado não informado.'; end if;
  if (select count(*) from jogadores where clube_id = v_c.id and not coalesce(juvenil, false)) >= 30 then raise exception 'O elenco já tem 30 jogadores com contrato.'; end if;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) < 0 then raise exception 'Clube no vermelho: não dá para assinar contrato novo.'; end if;
  v_sal := round(p_mercado * (1 + 0.1 * (p_temporadas - 1)));
  v_teto := teto_do_clube(v_c.id);
  v_folha := folha_do_clube(v_c.id);
  if v_folha + v_sal > v_teto then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_sal, v_teto; end if;
  v_ate := v_l.temporada + p_temporadas - case when rodadas_completas(v_l.id) < 9 then 1 else 0 end;
  update jogadores set juvenil = false, salario = v_sal, salario_mercado = p_mercado, contrato_ate = v_ate where id = p_jogador;
  return v_j.nome || ' assinou o primeiro contrato: ' || v_sal || ' mil por temporada, até o fim da temporada ' || v_ate || '.';
end $$;

-- comprar_pela_multa: igual à do 66_multa_e_bots.sql, com a folha somada por folha_do_clube
create or replace function public.comprar_pela_multa(p_user uuid, p_jogador bigint, p_salario int, p_temporadas int, p_reposicao jsonb default null, p_mercado int default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_de clubes%rowtype;
  v_para clubes%rowtype;
  v_l ligas%rowtype;
  v_janela text;
  v_valor int; v_multa int; v_teto int; v_folha int; v_caixa int; v_jogos int; v_id bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_para from clubes where dono = p_user;
  if v_para.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_de from clubes where id = v_j.clube_id;
  if v_de.id = v_para.id then raise exception 'Esse jogador já é seu.'; end if;
  if v_de.liga_id <> v_para.liga_id then raise exception 'O jogador é de outra liga.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null then raise exception 'O mercado está fechado. As janelas são até o fim da rodada 2 e entre as rodadas 9 e 11.'; end if;

  -- quem tem multa
  if v_j.salario is null then raise exception 'Esse jogador ainda não tem contrato definido.'; end if;
  if v_j.protegido then raise exception 'Esse jogador está na lista de protegidos do clube: não tem multa rescisória.'; end if;
  if coalesce(v_j.protegido_ate, -1) >= v_l.temporada then raise exception 'Esse jogador está na primeira temporada de contrato no clube: a multa só vale a partir da próxima.'; end if;
  -- o valor do jogador é o maior entre o salário do contrato, o salário de mercado gravado e o de hoje (p_mercado, pela nota atual,
  -- calculado pela função "mercado"): o jovem que evoluiu com salário antigo não sai mais barato
  v_valor := greatest(v_j.salario, coalesce(v_j.salario_mercado, 0), coalesce(p_mercado, 0));
  v_multa := 5 * v_valor;

  -- travas
  if v_para.divisao > v_de.divisao then raise exception 'O jogador não desce de divisão pela multa rescisória.'; end if;
  if v_janela = 'meio' and v_para.divisao = v_de.divisao then
    select count(*) into v_jogos from resultados r join partidas p on p.id = r.partida_id
      where p.liga_id = v_l.id and p.fase = 'liga' and (p.casa = v_de.id or p.fora = v_de.id)
        and exists (select 1 from jsonb_array_elements(r.relatorio->'jogadores') x where x->>'id' = 'j' || v_j.id);
    if v_jogos >= 5 then raise exception 'Na janela do meio, quem já jogou 5 partidas de liga pelo clube não vai para outro da mesma divisão (ele jogou %).', v_jogos; end if;
  end if;
  if (select count(*) from transferencias where para_clube = v_para.id and temporada = v_l.temporada and tipo = 'multa') >= 4 then
    raise exception 'Você já fez as 4 compras pela multa desta temporada.';
  end if;
  if (select count(*) from transferencias where de_clube = v_de.id and temporada = v_l.temporada and tipo = 'multa') >= (case when v_de.dono is null then 2 else 3 end) then
    raise exception 'Esse clube já perdeu o máximo de jogadores pela multa nesta temporada.';
  end if;
  if v_de.dono is null and exists (select 1 from transferencias where de_clube = v_de.id and temporada = v_l.temporada and tipo = 'multa' and janela = v_janela) then
    raise exception 'Clube sem dono só perde um jogador por janela, e este já perdeu.';
  end if;
  if (select count(*) from jogadores where clube_id = v_para.id) >= 50 then raise exception 'Seu elenco já tem 50 jogadores.'; end if;

  -- contrato novo
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_valor then
    raise exception 'O salário novo não pode ser menor que % mil por temporada.', v_valor;
  end if;
  v_teto := teto_do_clube(v_para.id);
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  v_folha := folha_do_clube(v_para.id);
  if v_folha + p_salario > v_teto then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + p_salario, v_teto; end if;

  -- dinheiro
  select caixa into v_caixa from financas where clube_id = v_para.id;
  if coalesce(v_caixa, 0) < v_multa then raise exception 'Caixa insuficiente: a multa é de % mil e o seu caixa é de % mil.', v_multa, coalesce(v_caixa, 0); end if;
  update financas set caixa = caixa - v_multa where clube_id = v_para.id;
  insert into financas (clube_id, caixa) values (v_de.id, 5000 + v_multa) on conflict (clube_id) do update set caixa = financas.caixa + v_multa;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (v_para.id, v_l.temporada, null, 'compra', -v_multa, 'Multa rescisória paga: ' || v_j.nome || ' (' || v_de.nome || ')'),
    (v_de.id, v_l.temporada, null, 'venda', v_multa, 'Multa rescisória recebida: ' || v_j.nome || ' (' || v_para.nome || ')');

  -- o jogador muda de clube, com contrato novo e protegido até o fim da temporada
  update jogadores set clube_id = v_para.id, salario = p_salario, salario_mercado = greatest(coalesce(v_j.salario_mercado, 0), coalesce(p_mercado, 0)), contrato_ate = v_l.temporada + p_temporadas,
    protegido_ate = v_l.temporada, protegido = false, principal = false, chegou_temporada = v_l.temporada
    where id = v_j.id;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, v_janela, 'multa', v_j.id, v_j.nome, v_j.pos, v_de.id, v_para.id, v_multa);

  -- clube sem dono repõe com um jogador gerado da mesma nota
  if v_de.dono is null and p_reposicao is not null then
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, chegou_temporada)
      values (v_de.id, p_reposicao->>'nome', coalesce(p_reposicao->>'pais', 'Brasil'), (p_reposicao->>'idade')::smallint, p_reposicao->>'pos', p_reposicao->'fam',
        array(select jsonb_array_elements_text(p_reposicao->'at')::smallint), v_j.principal,
        (p_reposicao->>'salario')::int, (p_reposicao->>'salario_mercado')::int, (p_reposicao->>'contrato_ate')::int, (p_reposicao->>'protegido_ate')::int, v_l.temporada)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (p_reposicao->>'tal')::smallint);
  end if;
  return v_j.nome || ' contratado por ' || v_multa || ' mil de multa rescisória.';
end $$;

-- ajustar_contrato: igual à do 68_economia.sql, com a folha somada por folha_do_clube
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0, p_com_luvas boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int; v_teto int; v_caixa int; v_pede int; v_luvas int := 0;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < 0 then raise exception 'Com o caixa negativo, aumentos e renovações ficam bloqueados.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  v_teto := teto_do_clube(v_c.id);
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if coalesce(p_com_luvas, false) then
    if p_temporadas = 0 then raise exception 'Luvas só na renovação do contrato.'; end if;
    v_pede := round(coalesce(v_j.salario_mercado, 0) * (1 + 0.1 * (p_temporadas - 1)));
    if p_salario >= v_pede then raise exception 'Com esse salário não há luvas a pagar: renove sem elas.'; end if;
    if p_salario < round(v_pede * 0.7) then raise exception 'Nem com luvas: o mínimo é % mil por temporada (70%% do pedido, % mil).', round(v_pede * 0.7), v_pede; end if;
    v_luvas := ceil((v_pede - p_salario) * 1.5 * p_temporadas);
    if coalesce(v_caixa, 0) < v_luvas then raise exception 'As luvas custam % mil e o caixa é de % mil.', v_luvas, coalesce(v_caixa, 0); end if;
  elsif p_temporadas > 0 and p_salario < v_j.salario_mercado then
    raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado;
  end if;
  if p_salario > v_teto * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_teto * 0.15); end if;
  v_folha := folha_do_clube(v_c.id);
  if v_folha - v_j.salario + p_salario > v_teto then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_teto;
  end if;
  if v_luvas > 0 then
    perform set_config('trem.luvas', '1', true); -- o contrato progressivo não encurta: a diferença foi paga em luvas
    update financas set caixa = caixa - v_luvas where clube_id = v_c.id;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      values (v_c.id, v_l.temporada, null, 'luvas', -v_luvas, 'Luvas: ' || v_j.nome || ' (' || p_temporadas || case when p_temporadas = 1 then ' temporada)' else ' temporadas)' end);
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
  if v_luvas > 0 then perform set_config('trem.luvas', '', true); end if;
end $$;

-- lancar_rodada: igual à do 55_estadio_torcida_e_publico.sql, com a folha somada por folha_do_clube
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_r resultados%rowtype;
  v_c clubes%rowtype;
  v_d divisoes%rowtype;
  v_o obras%rowtype;
  v_clube bigint;
  v_tv int; v_pat int; v_folha int; v_manut int; v_total int; v_extra int;
  v_publico int; v_bilheteria int; v_lugares int; v_carne int; v_avulsos int;
  v_saldo int; v_dh numeric; v_dt numeric;
  v_liga boolean; v_caixa int; v_n int;
  v_copa boolean; v_vencedor bigint; v_parte int; v_taxa int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  v_liga := v_p.fase = 'liga';
  v_copa := v_p.fase = 'copa';
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_r from resultados where partida_id = p_partida;
  select * into v_c from clubes where id = v_p.casa;
  select * into v_d from divisoes where liga_id = v_p.liga_id and divisao = v_c.divisao;
  if v_d.liga_id is null then
    v_d.receita_tv := v_l.receita_tv; v_d.receita_patrocinio := v_l.receita_patrocinio;
    v_d.preco_ingresso := v_l.preco_ingresso; v_d.torcida_base := v_l.torcida_base;
  end if;
  v_tv := round(v_d.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_d.receita_patrocinio::numeric / v_l.rodadas_por_temporada);

  -- público: o sócio-torcedor já pagou e ocupa o lugar; os demais compram ingresso se houver lugar
  v_lugares := lugares_do_estadio(v_c.estadio_nivel);
  v_carne := case when v_liga and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  -- se o público já foi definido no início da partida (definir_publico), vale ele
  v_publico := coalesce(v_p.publico, least(v_lugares, greatest(v_carne,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)))));
  v_avulsos := v_publico - v_carne;
  v_bilheteria := round(v_avulsos * v_d.preco_ingresso * preco_do_jogo(p_partida) / 1000.0); -- copa e playoff têm ingresso mais caro
  -- 10% da bilheteria de todo jogo vão para o fundo da liga, que paga os prêmios da copa
  v_taxa := round(v_bilheteria * 0.10);
  v_bilheteria := v_bilheteria - v_taxa;
  if v_taxa > 0 then
    perform set_config('trem.fundo', 'bilheteria', true);
    update ligas set fundo_taca = coalesce(fundo_taca, 0) + v_taxa where id = v_p.liga_id;
    perform set_config('trem.fundo', '', true);
  end if;
  update partidas set publico = v_publico where id = p_partida;

  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    v_total := 0;
    if v_liga then
      v_folha := round(folha_do_clube(v_clube)::numeric / v_l.rodadas_por_temporada);
      v_manut := round(manutencao_por_temporada(v_clube)::numeric / v_l.rodadas_por_temporada);
      v_total := v_tv + v_pat - v_folha - v_manut;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_clube, v_l.temporada, v_p.rodada, 'tv', v_tv, 'Cota de TV'),
        (v_clube, v_l.temporada, v_p.rodada, 'patrocinio', v_pat, 'Patrocínio'),
        (v_clube, v_l.temporada, v_p.rodada, 'salarios', -v_folha, 'Salários dos jogadores');
      if v_manut > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'manutencao', -v_manut, 'Manutenção das estruturas');
      end if;
      select round(greatest(0, (select receita_tv from divisoes where liga_id = v_p.liga_id and divisao = c.divisao - 1) - v_d.receita_tv)::numeric / 2 / v_l.rodadas_por_temporada)
        into v_extra from clubes c where c.id = v_clube and c.paraquedas = v_l.temporada;
      if coalesce(v_extra, 0) > 0 then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (v_clube, v_l.temporada, v_p.rodada, 'paraquedas', v_extra, 'Paraquedas de TV');
        v_total := v_total + v_extra;
      end if;
    end if;
    if v_copa then
      -- copa: a renda do jogo é dividida meio a meio (o centavo que sobra fica com o dono do estádio)
      v_parte := case when v_clube = v_p.casa then v_bilheteria - v_bilheteria / 2 else v_bilheteria / 2 end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_parte,
          'Bilheteria da copa, metade de ' || v_bilheteria || ' mil, já sem os 10% do fundo da liga (' || v_publico || ' pagantes' || case when v_clube = v_p.casa then ', no seu estádio' else ', no estádio do adversário' end || ')');
      v_total := v_total + v_parte;
    elsif v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria,
          'Bilheteria (' || v_avulsos || ' pagantes' || case when v_carne > 0 then ' e ' || v_carne || ' sócios-torcedores' else '' end || ', já sem os 10% do fundo da liga)' || case when v_liga then '' else ' · playoff' end);
      v_total := v_total + v_bilheteria;
    end if;
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)
      on conflict (clube_id) do update set caixa = financas.caixa + v_total;

    if v_liga then
      select * into v_o from obras where clube_id = v_clube and not concluida;
      if v_o.id is not null then
        if v_o.rodadas_restantes <= 1 then
          update obras set rodadas_restantes = 0, concluida = true where id = v_o.id;
          update clubes set
            ct_nivel = case when v_o.estrutura = 'ct' then v_o.nivel_alvo else ct_nivel end,
            medico_nivel = case when v_o.estrutura = 'medico' then v_o.nivel_alvo else medico_nivel end,
            fisio_nivel = case when v_o.estrutura = 'fisio' then v_o.nivel_alvo else fisio_nivel end,
            base_nivel = case when v_o.estrutura = 'base' then v_o.nivel_alvo else base_nivel end,
            estadio_nivel = case when v_o.estrutura = 'estadio' then v_o.nivel_alvo else estadio_nivel end
          where id = v_clube;
        else
          update obras set rodadas_restantes = rodadas_restantes - 1 where id = v_o.id;
        end if;
      end if;

      -- clube no vermelho: abaixo de 10% do teto no negativo, o prazo corre; na terceira rodada seguida, o jogo vende ao banco
      select caixa into v_caixa from financas where clube_id = v_clube;
      if v_caixa < -0.10 * teto_do_clube(v_clube) then
        update clubes set vermelho_rodadas = vermelho_rodadas + 1 where id = v_clube returning vermelho_rodadas into v_n;
        if v_n >= 3 then perform venda_forcada(v_clube); end if;
      else
        update clubes set vermelho_rodadas = 0 where id = v_clube and vermelho_rodadas <> 0;
      end if;
    end if;

    if v_r.partida_id is not null then
      v_saldo := case when v_clube = v_p.casa then v_r.gols_casa - v_r.gols_fora else v_r.gols_fora - v_r.gols_casa end;
      if v_copa then
        -- campo neutro: sem peso de mando; nos pênaltis, quem passa fica um pouco feliz e quem cai, um pouco triste
        v_vencedor := coalesce(v_p.vencedor, nullif(v_r.relatorio->>'vencedor', '')::bigint);
        if v_saldo = 0 and v_vencedor is not null then
          if v_vencedor = v_clube then v_dh := 0.5; v_dt := 0.005; else v_dh := -0.5; v_dt := -0.005; end if;
        elsif v_saldo > 0 then v_dh := 1; v_dt := 0.01;
        elsif v_saldo = 0 then v_dh := 0; v_dt := 0;
        else v_dh := -0.8; v_dt := -0.01;
        end if;
      elsif v_saldo > 0 then v_dh := 1; v_dt := 0.01;
      elsif v_saldo = 0 then v_dh := case when v_clube = v_p.casa then -0.3 else 0.2 end; v_dt := 0;
      else v_dh := case when v_clube = v_p.casa then -1 else -0.7 end; v_dt := -0.01;
      end if;
      update clubes set
        humor = least(16, greatest(0, humor + v_dh + (8 - humor) * 0.05)),
        torcida = least(round(base_da_torcida(id) * 1.4), greatest(round(base_da_torcida(id) * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
