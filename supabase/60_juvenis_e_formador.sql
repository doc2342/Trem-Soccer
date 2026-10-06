-- Trem Soccer · base, parte 2: juvenis sem contrato, elenco de 30 + 25, proteção do formado no clube até os 21 anos e 5% da venda ao clube formador.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 58_fundo_e_premios.sql e do 59_posicao_nova_e_safra.sql. Depois, republicar as funções "rodada" e "mercado".
-- Pode ser executado mais de uma vez sem apagar dados.
--
-- Juvenil: o jovem que sobe da base (virada ou peneira) de um clube com dirigente chega SEM contrato e sem salário. Treina, mas não joga partida oficial,
--   não vai à lista de transferência, não é vendido nem recebe pré-contrato. O dirigente o profissionaliza quando quiser (contrato de 1 a 3 temporadas,
--   pelo salário de mercado). Quem chega à virada com 21 anos ainda juvenil fica livre.
-- Elenco: 30 jogadores com contrato (de qualquer idade) e 25 juvenis. Antes eram 35 com mais de 21 anos e 50 no total.
-- Formado no clube: até a temporada em que tem 21 anos, a multa rescisória não vale e ele não aceita pré-contrato. Vale também em clube sem dirigente.
-- Clube formador: recebe 5% do valor de toda venda do jogador entre outros clubes; quem paga é o vendedor.

alter table public.jogadores add column if not exists juvenil boolean;   -- verdadeiro: da base, sem contrato (vazio vale falso)
alter table public.jogadores add column if not exists formador bigint references public.clubes(id) on delete set null; -- clube que revelou o jogador

-- quem já está na liga: até 21 anos e nunca comprado conta como formado no clube atual, com a multa travada até os 21
update public.jogadores j set formador = j.clube_id
  where j.formador is null and j.clube_id is not null and j.idade <= 21 and j.chegou_temporada is null;
update public.jogadores j set protegido_ate = greatest(coalesce(j.protegido_ate, 0), l.temporada + 21 - j.idade)
  from public.clubes c join public.ligas l on l.id = c.liga_id
  where c.id = j.clube_id and j.formador = j.clube_id and j.idade <= 21;

-- ---------- limite do elenco ----------
create or replace function public.vaga_no_elenco(p_clube bigint, p_idade int) returns text
language sql stable security definer set search_path = public as $$
  select case
    when (select count(*) from jogadores where clube_id = p_clube and not coalesce(juvenil, false)) >= 30 then 'o elenco já tem 30 jogadores com contrato'
    else null end
$$;

create or replace function public.conferir_vaga_no_elenco() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
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

-- ---------- guardas do juvenil e do formado no clube ----------
create or replace function public.guardas_da_base() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_temp int;
begin
  if coalesce(old.juvenil, false) then
    if new.clube_id is null then new.juvenil := false; -- saiu do clube (dispensa ou virada): passa a ser um jogador livre comum
    elsif new.clube_id is distinct from old.clube_id then raise exception '% é juvenil, sem contrato: só muda de clube depois de profissionalizado.', old.nome;
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
drop trigger if exists guardas_da_base on public.jogadores;
create trigger guardas_da_base before update on public.jogadores for each row execute function public.guardas_da_base();

-- ---------- peneira: os jovens chegam como juvenis ----------
create or replace function public.receber_jovens(p_user uuid, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_l ligas%rowtype; r record; v_id bigint; n int := 0;
begin
  select * into v_c from clubes where dono = p_user for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if rodadas_completas(v_l.id) < 9 then raise exception 'A peneira só acontece a partir da rodada 9.'; end if;
  if v_c.peneira_temporada is not distinct from v_l.temporada then raise exception 'A peneira desta temporada já foi feita.'; end if;
  update clubes set peneira_temporada = v_l.temporada where id = v_c.id;
  for r in select value as v from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    exit when (select count(*) from jogadores where clube_id = v_c.id and juvenil) >= 25; -- sem vaga entre os juvenis: os que não couberem ficam de fora
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, juvenil, formador)
      values (v_c.id, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        null, (r.v->>'salario_mercado')::int, null, v_l.temporada + 21 - (r.v->>'idade')::int, true, v_c.id)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    n := n + 1;
  end loop;
  return case n when 0 then 'A peneira desta temporada não revelou ninguém.' when 1 then 'A peneira revelou 1 juvenil.' else 'A peneira revelou ' || n || ' juvenis.' end;
end $$;
revoke execute on function public.receber_jovens(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.receber_jovens(uuid, jsonb) to service_role;

-- ---------- profissionalizar ----------
-- Só a função do servidor "mercado" chama: é ela que calcula o salário de mercado pelos atributos de hoje.
-- Até a rodada 8 a temporada em andamento conta como a primeira do contrato; da 9 em diante o contrato começa a contar da próxima.
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
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_c.id;
  if v_folha + v_sal > v_teto then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_sal, v_teto; end if;
  v_ate := v_l.temporada + p_temporadas - case when rodadas_completas(v_l.id) < 9 then 1 else 0 end;
  update jogadores set juvenil = false, salario = v_sal, salario_mercado = p_mercado, contrato_ate = v_ate where id = p_jogador;
  return v_j.nome || ' assinou o primeiro contrato: ' || v_sal || ' mil por temporada, até o fim da temporada ' || v_ate || '.';
end $$;
revoke execute on function public.profissionalizar_jogador(uuid, bigint, int, int) from public, anon, authenticated;
grant execute on function public.profissionalizar_jogador(uuid, bigint, int, int) to service_role;

-- ---------- clube formador: 5% de toda venda ----------
create or replace function public.repassar_ao_formador() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_f bigint; v_v int;
begin
  if new.jogador_id is null or new.de_clube is null or coalesce(new.valor, 0) <= 0 then return new; end if;
  select formador into v_f from jogadores where id = new.jogador_id;
  if v_f is null or v_f = new.de_clube or v_f is not distinct from new.para_clube then return new; end if;
  v_v := round(new.valor * 0.05);
  if v_v <= 0 then return new; end if;
  update financas set caixa = caixa - v_v where clube_id = new.de_clube;
  update financas set caixa = caixa + v_v where clube_id = v_f;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
    (new.de_clube, new.temporada, null, 'formador', -v_v, 'Repasse de 5% ao clube formador: ' || new.jogador),
    (v_f, new.temporada, null, 'formador', v_v, 'Clube formador: 5% da venda de ' || new.jogador);
  return new;
end $$;
drop trigger if exists repassar_ao_formador on public.transferencias;
create trigger repassar_ao_formador after insert on public.transferencias for each row execute function public.repassar_ao_formador();

-- ---------- virada: os novos chegam com a marca de juvenil e com o clube formador ----------
create or replace function public.virar_temporada(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype;
  r record;
  v_id bigint;
  v_premios int; v_apos int; v_novos int := 0; v_mov int := 0; v_imposto int; v_terceira int; v_cota int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador vira a temporada.'; end if;
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null then raise exception 'Liga não encontrada.'; end if;
  if (p_plano->>'temporada')::int is distinct from v_l.temporada then raise exception 'Este plano é de outra temporada. Prepare a virada de novo.'; end if;
  if not exists (select 1 from partidas where liga_id = p_liga) then raise exception 'Não há partidas nesta temporada.'; end if;
  if exists (select 1 from partidas where liga_id = p_liga and (not processada or fim > now())) then
    raise exception 'A temporada ainda não acabou: há partidas por calcular ou em transmissão.';
  end if;

  -- 1. histórico e prêmios
  insert into historico (liga_id, temporada, clube_id, divisao, grupo, posicao, pontos, vitorias, empates, derrotas, gols_pro, gols_contra, premio, destino)
    select p_liga, v_l.temporada, x.clube_id, x.divisao, x.grupo, x.posicao, x.pontos, x.vitorias, x.empates, x.derrotas, x.gols_pro, x.gols_contra, x.premio, x.destino
    from jsonb_to_recordset(p_plano->'classificacao') as x(clube_id bigint, divisao int, grupo text, posicao int, pontos int, vitorias int, empates int, derrotas int, gols_pro int, gols_contra int, premio int, destino text)
    join clubes c on c.id = x.clube_id and c.liga_id = p_liga;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select clube_id, v_l.temporada, null, 'premio', premio, 'Prêmio da liga: ' || posicao || 'º lugar'
    from historico where liga_id = p_liga and temporada = v_l.temporada and premio > 0;
  update financas f set caixa = f.caixa + h.premio from historico h
    where h.liga_id = p_liga and h.temporada = v_l.temporada and h.clube_id = f.clube_id;
  select coalesce(sum(premio), 0) into v_premios from historico where liga_id = p_liga and temporada = v_l.temporada;

  -- 2. prêmio antecipado: o valor cheio sai agora
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    select id, v_l.temporada, null, 'antecipacao', -premio_antecipado, 'Desconto do prêmio antecipado'
    from clubes where liga_id = p_liga and premio_antecipado > 0;
  update financas f set caixa = f.caixa - c.premio_antecipado from clubes c
    where c.liga_id = p_liga and c.premio_antecipado > 0 and c.id = f.clube_id;

  -- 3. imposto sobre o lucro da temporada (tudo o que entrou menos tudo o que saiu, prêmio incluído)
  v_imposto := 0;
  for r in select c.id, imposto_do_lucro(coalesce((select sum(valor) from lancamentos x where x.clube_id = c.id and x.temporada = v_l.temporada), 0)::int, teto_do_clube(c.id)) as valor
           from clubes c where c.liga_id = p_liga loop
    if r.valor > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.id, v_l.temporada, null, 'imposto', -r.valor, 'Imposto sobre o lucro da temporada');
      update financas set caixa = caixa - r.valor where clube_id = r.id;
      v_imposto := v_imposto + r.valor;
    end if;
  end loop;

  -- 4. jogadores: quem fica, quem se aposenta, quem chega
  update jogadores j set idade = x.idade, at = array(select jsonb_array_elements_text(x.at)::smallint),
      salario = x.salario, salario_mercado = x.salario_mercado, contrato_ate = x.contrato_ate
    from jsonb_to_recordset(p_plano->'jogadores') as x(id bigint, idade int, at jsonb, salario int, salario_mercado int, contrato_ate int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);
  delete from jogadores where id in (select (jsonb_array_elements_text(p_plano->'aposentados'))::bigint)
    and clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics v_apos = row_count;
  for r in select value as v from jsonb_array_elements(p_plano->'novos') loop
    if not exists (select 1 from clubes where id = (r.v->>'clube_id')::bigint and liga_id = p_liga) then continue; end if;
    -- juvenil só entra se houver vaga entre os 25 (60_juvenis_e_formador.sql)
    if coalesce((r.v->>'juvenil')::boolean, false) and (select count(*) from jogadores where clube_id = (r.v->>'clube_id')::bigint and juvenil) >= 25 then continue; end if;
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate, juvenil, formador)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int,
        coalesce((r.v->>'juvenil')::boolean, false), (r.v->>'clube_id')::bigint)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
    v_novos := v_novos + 1;
  end loop;
  update jogadores set amarelos = 0,
      fora_jogos = case when fora_motivo = 'suspensão' then 0 else fora_jogos end,
      fora_motivo = case when fora_motivo = 'suspensão' then null else fora_motivo end
    where clube_id in (select id from clubes where liga_id = p_liga);

  -- 5. acesso e descenso
  update clubes set paraquedas = null, carne = 0, premio_antecipado = 0 where liga_id = p_liga;
  for r in select * from jsonb_to_recordset(coalesce(p_plano->'movimentos', '[]'::jsonb)) as x(clube_id bigint, grupo text, divisao int, caiu boolean) loop
    update clubes c set grupo = r.grupo, divisao = r.divisao,
        paraquedas = case when r.caiu then v_l.temporada + 1 else null end,
        torcida = round(c.torcida::numeric
          * (select torcida_base from divisoes where liga_id = p_liga and divisao = r.divisao)
          / greatest(1, (select torcida_base from divisoes where liga_id = p_liga and divisao = c.divisao)))
      where c.id = r.clube_id and c.liga_id = p_liga;
    v_mov := v_mov + 1;
  end loop;

  -- 6. fundo da liga: metade do imposto vai, por igual, para os clubes da terceira divisão da temporada que começa;
  --    a outra metade fica guardada para a segunda taça
  select count(*) into v_terceira from clubes where liga_id = p_liga and divisao = 3;
  v_cota := 0; -- desde o 58_fundo_e_premios.sql o imposto inteiro vai para o fundo da liga; a Série C recebe bônus por mérito
  if v_cota > 0 then
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select id, v_l.temporada + 1, null, 'fundo', v_cota, 'Fundo da liga (imposto da temporada ' || v_l.temporada || ')'
      from clubes where liga_id = p_liga and divisao = 3;
    update financas f set caixa = f.caixa + v_cota from clubes c where c.liga_id = p_liga and c.divisao = 3 and c.id = f.clube_id;
  end if;

  delete from partidas where liga_id = p_liga;
  update ligas set temporada = temporada + 1, fundo_taca = fundo_taca + (v_imposto - v_cota * v_terceira) where id = p_liga;
  return 'Temporada ' || v_l.temporada || ' encerrada: ' || v_premios || ' mil em prêmios, ' || v_imposto || ' mil de imposto (tudo para o fundo da liga), ' || v_mov || ' clubes mudam de divisão, ' || v_apos || ' aposentados e ' || v_novos
    || ' jovens. Começa a temporada ' || (v_l.temporada + 1) || '.';
end $$;
revoke execute on function public.virar_temporada(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada(bigint, jsonb) to authenticated;
