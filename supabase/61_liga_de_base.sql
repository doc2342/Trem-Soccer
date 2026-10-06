-- Trem Soccer · base, parte 3: liga de base, prêmios do fundo livres de imposto e mínimo de 16 jogadores com contrato.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 60_juvenis_e_formador.sql. Depois, republicar a função "rodada": é ela que joga as partidas da liga de base.
-- Pode ser executado mais de uma vez sem apagar dados.
--
-- Liga de base: em cada grupo, os juvenis jogam um turno único de 9 rodadas, com os mesmos confrontos do primeiro turno da liga principal.
--   A rodada N da base acontece na hora da rodada 2N da liga. O time é montado pelo servidor: juvenis de verdade e, só nas vagas que faltarem,
--   garotos da escolinha. Fica guardado o placar, quem fez os gols e as notas. O campeão de cada grupo recebe 200 mil do fundo da liga.
-- Imposto: os bônus de mérito e os prêmios individuais pagos pelo fundo deixam de contar no lucro tributado.
-- Elenco mínimo: clube com dirigente não pode ficar com menos de 16 jogadores COM CONTRATO (juvenil não conta).

create table if not exists public.base_jogos (
  id bigint generated always as identity primary key,
  liga_id bigint not null references public.ligas(id) on delete cascade,
  temporada int not null,
  grupo text not null,
  rodada int not null,
  casa bigint not null references public.clubes(id) on delete cascade,
  fora bigint not null references public.clubes(id) on delete cascade,
  inicio timestamptz not null,
  processada boolean not null default false,
  gols_casa int, gols_fora int,
  dados jsonb -- { "jogadores": [{ id, n (nome), t (0 casa, 1 fora), p (posição), g, a, nota, min }] }
);
create index if not exists base_jogos_liga on public.base_jogos (liga_id, temporada, grupo, rodada);
create index if not exists base_jogos_pendentes on public.base_jogos (inicio) where not processada;
alter table public.base_jogos enable row level security;
drop policy if exists base_jogos_ler on public.base_jogos;
create policy base_jogos_ler on public.base_jogos for select using (true);
grant select on public.base_jogos to anon, authenticated;

create table if not exists public.base_campeoes (
  liga_id bigint not null references public.ligas(id) on delete cascade,
  temporada int not null,
  grupo text not null,
  clube_id bigint references public.clubes(id) on delete set null,
  primary key (liga_id, temporada, grupo)
);
alter table public.base_campeoes enable row level security;
drop policy if exists base_campeoes_ler on public.base_campeoes;
create policy base_campeoes_ler on public.base_campeoes for select using (true);
grant select on public.base_campeoes to anon, authenticated;

-- Monta o calendário da base a partir do primeiro turno da liga. Uso interno (o administrador chama pela função de baixo).
-- Não mexe se a temporada já tem partida de base jogada.
create or replace function public.montar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; v_turno int; n int;
begin
  select temporada into v_temp from ligas where id = p_liga;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_temp and processada) then return 0; end if;
  delete from base_jogos where liga_id = p_liga and temporada = v_temp;
  select max(rodada) / 2 into v_turno from partidas where liga_id = p_liga and fase = 'liga';
  if coalesce(v_turno, 0) < 1 then return 0; end if;
  insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio)
    select p.liga_id, v_temp, p.grupo, p.rodada, p.casa, p.fora,
        coalesce((select min(q.inicio) from partidas q where q.liga_id = p.liga_id and q.grupo = p.grupo and q.fase = 'liga' and q.rodada = p.rodada * 2), p.inicio)
      from partidas p where p.liga_id = p_liga and p.fase = 'liga' and p.rodada <= v_turno;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.montar_liga_de_base(bigint) from public, anon, authenticated;

create or replace function public.gerar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador gera a liga de base.'; end if;
  return montar_liga_de_base(p_liga);
end $$;
revoke execute on function public.gerar_liga_de_base(bigint) from public, anon;
grant execute on function public.gerar_liga_de_base(bigint) to authenticated;

-- O administrador chama antes da virada: o campeão de cada grupo já encerrado recebe 200 mil do fundo. Pode ser chamada de novo sem pagar duas vezes.
create or replace function public.premiar_liga_de_base(p_liga bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_temp int; g record; v_c bigint; n int := 0; v_premio int := 200;
begin
  if not public.eh_admin() then raise exception 'Só o administrador premia a liga de base.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  for g in select grupo from base_jogos where liga_id = p_liga and temporada = v_temp group by grupo having bool_and(processada) loop
    continue when exists (select 1 from base_campeoes where liga_id = p_liga and temporada = v_temp and grupo = g.grupo);
    select t.clube into v_c from (
      select x.clube, sum(case when x.gp > x.gc then 3 when x.gp = x.gc then 1 else 0 end) as pts, sum(x.gp - x.gc) as saldo, sum(x.gp) as gp
        from (select casa as clube, gols_casa as gp, gols_fora as gc from base_jogos where liga_id = p_liga and temporada = v_temp and grupo = g.grupo
              union all select fora, gols_fora, gols_casa from base_jogos where liga_id = p_liga and temporada = v_temp and grupo = g.grupo) x
        group by x.clube order by 2 desc, 3 desc, 4 desc, 1 limit 1) t;
    continue when v_c is null;
    insert into base_campeoes (liga_id, temporada, grupo, clube_id) values (p_liga, v_temp, g.grupo, v_c);
    update financas set caixa = caixa + v_premio where clube_id = v_c;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (v_c, v_temp, null, 'merito', v_premio, 'Fundo da liga: título da liga de base');
    n := n + 1;
  end loop;
  if n > 0 then
    perform set_config('trem.fundo', 'merito', true);
    update ligas set fundo_taca = fundo_taca - n * v_premio where id = p_liga;
    perform set_config('trem.fundo', '', true);
  end if;
  return case when n = 0 then '' else n * v_premio || ' mil aos ' || n || ' campeões da liga de base.' end;
end $$;
revoke execute on function public.premiar_liga_de_base(bigint) from public, anon;
grant execute on function public.premiar_liga_de_base(bigint) to authenticated;

-- ---------- elenco mínimo: 16 com contrato ----------
create or replace function public.minimo_de_contratados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.clube_id is not null and new.clube_id is distinct from old.clube_id and not coalesce(old.juvenil, false)
     and coalesce(current_setting('trem.virada', true), '') <> '1' and not public.eh_admin()
     and exists (select 1 from clubes where id = old.clube_id and dono is not null)
     and (select count(*) from jogadores where clube_id = old.clube_id and not coalesce(juvenil, false)) <= 16 then
    raise exception 'O clube não pode ficar com menos de 16 jogadores com contrato (juvenil não conta).';
  end if;
  return new;
end $$;
drop trigger if exists minimo_de_contratados on public.jogadores;
create trigger minimo_de_contratados before update of clube_id on public.jogadores for each row execute function public.minimo_de_contratados();

-- ---------- imposto: bônus de mérito e prêmios individuais ficam de fora do lucro ----------
create or replace function public.lucros_da_temporada(p_liga bigint) returns table (clube_id bigint, lucro int, teto int, antecipado int)
language sql stable security definer set search_path = public as $$
  select c.id, coalesce((select sum(valor) from lancamentos x where x.clube_id = c.id and x.temporada = l.temporada and x.tipo not in ('merito', 'premio_individual')), 0)::int,
    teto_do_clube(c.id), c.premio_antecipado
  from clubes c join ligas l on l.id = c.liga_id
  where c.liga_id = p_liga and public.eh_admin()
$$;
revoke execute on function public.lucros_da_temporada(bigint) from public, anon;
grant execute on function public.lucros_da_temporada(bigint) to authenticated;

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
  for r in select c.id, imposto_do_lucro(coalesce((select sum(valor) from lancamentos x where x.clube_id = c.id and x.temporada = v_l.temporada and x.tipo not in ('merito', 'premio_individual')), 0)::int, teto_do_clube(c.id)) as valor
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

-- liga que já tem calendário nesta temporada: monta a base agora (as rodadas da base cuja hora já passou são jogadas na próxima chamada do servidor)
select public.montar_liga_de_base(l.id) from public.ligas l
  where exists (select 1 from public.partidas p where p.liga_id = l.id and p.fase = 'liga');
