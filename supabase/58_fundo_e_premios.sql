-- Trem Soccer · fundo da liga: imposto e taxas inteiros para o fundo, bônus de mérito da Série C, prêmios individuais
-- e copa que paga mais quando o fundo está cheio.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 54_estatisticas_da_liga.sql e do 55_estadio_torcida_e_publico.sql já executados. Não precisa republicar função nenhuma.
-- Pode ser executado mais de uma vez.
--
-- 1. O imposto sobre o lucro e as taxas de venda entre dirigentes vão inteiros para o fundo (antes, metade era dividida na Série C).
-- 2. Logo antes da virada, a página do administrador chama premiar_temporada, que paga com o fundo:
--    a) bônus de mérito da Série C (a página manda a lista): campeão do grupo 800 mil, 2º 400, 3º 300, 4º 200; quem sobe pelo playoff, 600;
--    b) prêmios individuais, ao clube do último jogo do jogador na competição. Em cada série: artilheiro, garçom, melhor jogador,
--       melhor goleiro e revelação (até 21 anos), a 100 mil na Série A, 60 mil nas B e 40 mil nas C; o melhor jogador da Série A é o
--       Bola de Ouro e vale 200 mil. Na copa: artilheiro e craque (melhor nota das quartas em diante), 100 mil cada.
-- 3. A copa paga mais quando o fundo passa da reserva de 25 mi: o fator (de 1 a 2) é calculado quando o calendário é gerado
--    (fator_da_copa) e fica guardado em ligas.copa->>'fator'; todos os prêmios da copa são multiplicados por ele.

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
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values ((r.v->>'clube_id')::bigint, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), false,
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
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

create or replace function public.distribuir_taxas(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_total int; v_n int; v_cota int; v_temp int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador distribui as taxas.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  select coalesce(sum(taxa), 0) into v_total from transferencias where liga_id = p_liga and not taxa_distribuida and temporada < v_temp;
  if v_total <= 0 then return 0; end if;
  select count(*) into v_n from clubes where liga_id = p_liga and divisao = 3;
  v_cota := 0; -- desde o 58_fundo_e_premios.sql as taxas vão inteiras para o fundo da liga
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

-- ---------- copa que paga mais com o fundo cheio ----------
create or replace function public.fator_da_copa(p_liga bigint) returns numeric language sql stable security definer set search_path = public as $$
  select round(least(2, greatest(1, 1 + (coalesce(fundo_taca, 0) - 25000) / 11200.0)), 2) from ligas where id = p_liga
$$;
revoke execute on function public.fator_da_copa(bigint) from public;
grant execute on function public.fator_da_copa(bigint) to anon, authenticated, service_role;

create or replace function public.copa_premiar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_l ligas%rowtype; v_pagas jsonb; v_fase int; v_valor int; v_total int := 0; v_n int;
  v_final partidas%rowtype; v_campeao bigint; v_vice bigint;
  c_valores int[] := array[0, 50, 150, 300, 500]; v_fator numeric; v_camp int; v_vc int; -- ao entrar na fase 1 a 5 (preliminar, 32, oitavas, quartas, semifinal)
  c_nomes text[] := array['preliminar', 'fase de 32', 'oitavas', 'quartas', 'semifinal'];
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.copa is null then return 0; end if;
  v_fator := least(2, greatest(1, coalesce((v_l.copa->>'fator')::numeric, 1))); -- copa mais rica quando o fundo passou da reserva
  v_camp := round(2000 * v_fator); v_vc := round(800 * v_fator);
  v_pagas := coalesce(v_l.copa->'pagas', '[]'::jsonb);
  for v_fase in 2..5 loop
    if v_pagas @> to_jsonb(v_fase) then continue; end if;
    if not exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) then continue; end if;
    v_valor := round(c_valores[v_fase] * v_fator);
    -- o fundo precisa ter saldo para a fase inteira; sem saldo, o prêmio fica pendente e sai quando o fundo encher
    if coalesce(v_l.fundo_taca, 0) - v_total < v_valor * (select count(*) from (select casa as clube from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
        union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) x) then continue; end if;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
      select x.clube, v_l.temporada, 100 + v_fase, 'copa', v_valor, 'Copa do Brasil: prêmio por chegar ' || case when v_fase = 2 then 'à ' else 'às ' end || c_nomes[v_fase]
        from (select casa as clube from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
              union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase) x;
    get diagnostics v_n = row_count;
    update financas f set caixa = f.caixa + v_valor
      where f.clube_id in (select casa from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase
                           union select fora from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase);
    v_total := v_total + v_valor * v_n;
    v_pagas := v_pagas || to_jsonb(v_fase);
  end loop;
  -- final: paga depois do apito final (resultado liberado e efeitos gravados, com o vencedor anotado)
  if not v_pagas @> to_jsonb(6) then
    select * into v_final from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = 6 order by id limit 1;
    if v_final.id is not null and v_final.processada and v_final.fim <= now()
       and exists (select 1 from resultados r where r.partida_id = v_final.id and r.efeitos is null) then
      select coalesce(v_final.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint,
                      case when r.gols_fora > r.gols_casa then v_final.fora else v_final.casa end)
        into v_campeao from resultados r where r.partida_id = v_final.id;
      v_vice := case when v_campeao = v_final.casa then v_final.fora else v_final.casa end;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
        (v_campeao, v_l.temporada, 106, 'copa', v_camp, 'Copa do Brasil: prêmio de campeão'),
        (v_vice, v_l.temporada, 106, 'copa', v_vc, 'Copa do Brasil: prêmio de vice-campeão');
      update financas set caixa = caixa + v_camp where clube_id = v_campeao;
      update financas set caixa = caixa + v_vc where clube_id = v_vice;
      v_total := v_total + v_camp + v_vc;
      v_pagas := v_pagas || to_jsonb(6);
      v_l.copa := jsonb_set(v_l.copa, '{campeao}', to_jsonb(v_campeao));
    end if;
  end if;
  if v_total > 0 then
    perform set_config('trem.fundo', 'copa', true);
    update ligas set fundo_taca = fundo_taca - v_total, copa = jsonb_set(v_l.copa, '{pagas}', v_pagas) where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return v_total;
end $$;
revoke execute on function public.copa_premiar(bigint) from public, anon, authenticated;
grant execute on function public.copa_premiar(bigint) to service_role;

-- ---------- prêmios individuais ----------
create table if not exists public.premios_individuais (
  liga_id bigint not null references public.ligas on delete cascade,
  temporada int not null,
  comp text not null,       -- 'A' a 'E' ou 'COPA'
  premio text not null,     -- artilheiro, garcom, melhor, goleiro, revelacao, craque
  jogador_id text,
  jogador text,
  pos text,
  clube_id bigint references public.clubes on delete set null,
  valor int not null,
  numero numeric,           -- o número que deu o prêmio (gols, assistências, nota média, jogos sem sofrer gol)
  primary key (liga_id, temporada, comp, premio)
);
alter table public.premios_individuais enable row level security;
drop policy if exists premios_individuais_leitura on public.premios_individuais;
create policy premios_individuais_leitura on public.premios_individuais for select using (true);

-- Melhor nota média de uma competição, com filtros de idade e de fase da copa. Uso interno.
create or replace function public.melhor_nota(p_liga bigint, p_comp text, p_idade_max int, p_fase_min int, p_minimo int) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) from (
    select x.j->>'id' as id, max(x.j->>'nome') as nome, (array_agg(x.j->>'pos' order by p.id desc))[1] as pos,
        (array_agg(case when coalesce((x.j->>'time')::int, 0) = 0 then p.casa else p.fora end order by p.id desc))[1] as clube,
        count(*) as j, round(avg((x.j->>'nota')::numeric), 2) as nota
      from partidas p join resultados r on r.partida_id = p.id
        cross join lateral jsonb_array_elements(coalesce(r.relatorio->'jogadores', '[]'::jsonb)) as x(j)
      where p.liga_id = p_liga and r.libera_em <= now()
        and (case when p_comp = 'COPA' then p.fase = 'copa' else p.fase = 'liga' and p.grupo = p_comp end)
        and coalesce((x.j->>'minutos')::numeric, 0) >= 30 and (x.j->>'nota') is not null
        and (p_fase_min is null or p.copa_fase >= p_fase_min)
        and (p_idade_max is null or exists (select 1 from jogadores jj
              where jj.id = nullif(regexp_replace(x.j->>'id', '\D', '', 'g'), '')::bigint and jj.idade <= p_idade_max))
      group by x.j->>'id' having count(*) >= p_minimo
      order by nota desc, j desc limit 1) t
$$;
revoke execute on function public.melhor_nota(bigint, text, int, int, int) from public, anon, authenticated;

-- Paga, com o fundo da liga, os bônus de mérito (lista vinda da página do administrador: [{ clube_id, valor, descricao }]) e os prêmios
-- individuais da temporada. Tem de rodar ANTES da virada, que apaga as partidas. Cada parte só é paga uma vez por temporada.
create or replace function public.premiar_temporada(p_liga bigint, p_merito jsonb default '[]'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_t int; v_g text; v_div int; v_valor int; d jsonb; x jsonb; r record; v_min int;
  v_merito int := 0; v_ind int := 0; v_n int := 0;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga for update;
  if v_t is null then return ''; end if;

  -- a) mérito
  if not exists (select 1 from lancamentos l join clubes c on c.id = l.clube_id where c.liga_id = p_liga and l.temporada = v_t and l.tipo = 'merito') then
    for r in select * from jsonb_to_recordset(coalesce(p_merito, '[]'::jsonb)) as m(clube_id bigint, valor int, descricao text) loop
      if r.valor > 0 and exists (select 1 from clubes where id = r.clube_id and liga_id = p_liga) then
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'merito', r.valor, coalesce(r.descricao, 'Bônus de mérito'));
        update financas set caixa = caixa + r.valor where clube_id = r.clube_id;
        v_merito := v_merito + r.valor;
      end if;
    end loop;
    if v_merito > 0 then
      perform set_config('trem.fundo', 'merito', true);
      update ligas set fundo_taca = fundo_taca - v_merito where id = p_liga;
      perform set_config('trem.fundo', '', true);
    end if;
  end if;

  -- b) prêmios individuais
  if not exists (select 1 from premios_individuais where liga_id = p_liga and temporada = v_t) then
    for v_g in select distinct grupo from partidas where liga_id = p_liga and fase = 'liga' order by 1 loop
      v_div := coalesce((select min(divisao) from clubes where liga_id = p_liga and grupo = v_g), 2);
      v_valor := (case v_div when 1 then 100 when 2 then 60 else 40 end);
      d := estatisticas_da_liga(p_liga, v_g);
      v_min := coalesce((d->>'minimo')::int, 3);
      x := d->'artilheiros'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'artilheiro', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'gols')::numeric) on conflict do nothing; end if;
      x := d->'assistencias'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'garcom', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'ass')::numeric) on conflict do nothing; end if;
      x := d->'notas'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'melhor', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, (case when v_div = 1 then 200 else v_valor end), (x->>'nota')::numeric) on conflict do nothing; end if;
      x := d->'goleiros'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'goleiro', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'sem')::numeric) on conflict do nothing; end if;
      x := melhor_nota(p_liga, v_g, 21, null, v_min);
      if x is not null then insert into premios_individuais values (p_liga, v_t, v_g, 'revelacao', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, v_valor, (x->>'nota')::numeric) on conflict do nothing; end if;
    end loop;
    if exists (select 1 from partidas where liga_id = p_liga and fase = 'copa') then
      x := estatisticas_da_liga(p_liga, 'COPA')->'artilheiros'->0;
      if x is not null then insert into premios_individuais values (p_liga, v_t, 'COPA', 'artilheiro', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, 100, (x->>'gols')::numeric) on conflict do nothing; end if;
      x := coalesce(melhor_nota(p_liga, 'COPA', null, 4, 2), melhor_nota(p_liga, 'COPA', null, 4, 1));
      if x is not null then insert into premios_individuais values (p_liga, v_t, 'COPA', 'craque', x->>'id', x->>'nome', x->>'pos', (x->>'clube')::bigint, 100, (x->>'nota')::numeric) on conflict do nothing; end if;
    end if;
    for r in select * from premios_individuais where liga_id = p_liga and temporada = v_t and clube_id is not null loop
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'premio_individual', r.valor,
        'Prêmio individual: ' || r.jogador || ' (' || (case r.premio when 'artilheiro' then 'artilheiro' when 'garcom' then 'garçom' when 'melhor' then 'melhor jogador'
          when 'goleiro' then 'melhor goleiro' when 'revelacao' then 'revelação' else 'craque da copa' end) || ')');
      update financas set caixa = caixa + r.valor where clube_id = r.clube_id;
      v_ind := v_ind + r.valor; v_n := v_n + 1;
    end loop;
    if v_ind > 0 then
      perform set_config('trem.fundo', 'premios', true);
      update ligas set fundo_taca = fundo_taca - v_ind where id = p_liga;
      perform set_config('trem.fundo', '', true);
    end if;
  end if;
  return 'Fundo da liga: ' || v_merito || ' mil em bônus de mérito e ' || v_ind || ' mil em ' || v_n || ' prêmios individuais.';
end $$;
revoke execute on function public.premiar_temporada(bigint, jsonb) from public, anon;
grant execute on function public.premiar_temporada(bigint, jsonb) to authenticated, service_role;

-- reiniciar o teste (a temporada volta) apaga os prêmios individuais
create or replace function public.limpar_premios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.temporada < old.temporada then delete from premios_individuais where liga_id = new.id; end if;
  return null;
end $$;
drop trigger if exists ligas_limpar_premios on public.ligas;
create trigger ligas_limpar_premios after update of temporada on public.ligas for each row execute function public.limpar_premios();
