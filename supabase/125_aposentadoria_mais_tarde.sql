-- 125: aposentadoria mais tarde. Anúncio a partir dos 34 (vira 35 na virada), 20% por ano até 80%;
-- quem tem 39 se aposenta obrigatoriamente (ninguém joga com 40). Antes: a partir dos 33, limite 38.
-- Mesmas funções do SQL 46, só com as idades trocadas.

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
      and (j.idade + 1 >= 40
        or (j.idade + 1 >= 35 and (j.contrato_ate is null or j.contrato_ate <= v_l.temporada) and random() < (j.idade + 1 - 34) * 0.2));
  get diagnostics n = row_count;
  update ligas set aposentadorias_em = v_l.temporada where id = p_liga;
  return n;
end $$;

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
    if new.idade >= 34 then new.contrato_ate := least(new.contrato_ate, v_temp + 1); end if;       -- 34 ou mais: só até o fim da temporada seguinte
    new.contrato_ate := least(new.contrato_ate, v_temp + greatest(0, 39 - new.idade));             -- ninguém assina para a temporada em que teria 40
  end if;
  return new;
end $$;

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
    if v_j.idade >= 39 then raise exception 'Esse jogador chega à idade limite na virada: não entra em pré-acordo.'; end if;
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
  if v_j.idade >= 39 then raise exception 'Esse jogador chega à idade limite na virada.'; end if;
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

-- quem anunciou nesta temporada com menos de 34 desiste (pela regra nova ainda não poderia)
update jogadores j set aposenta_em = null
  from ligas l
  where j.aposenta_em = l.temporada and j.idade < 34
    and l.id = coalesce((select liga_id from clubes where id = j.clube_id), j.livre_liga)
  returning j.nome, j.idade;
