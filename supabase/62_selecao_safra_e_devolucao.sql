-- Trem Soccer · seleção da temporada, safra em jogador que já está no clube e devolução do repasse ao formador.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 60_juvenis_e_formador.sql. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Seleção da temporada: os onze de melhor nota média de cada série (1 goleiro, 4 de defesa, 3 de meio e 3 de ataque), só de honra, sem dinheiro.
--   Fica na mesma tabela dos prêmios individuais, com o prêmio "sel01" a "sel11". O administrador chama antes da virada.
-- Safra: em clube sem dirigente, o talento raro pode cair num jogador de até 19 anos que já está no elenco; aí o talento dele é trocado.
-- Formador: quando uma transferência é anulada, os 5% repassados ao clube formador voltam para quem pagou.

create or replace function public.selecao_da_temporada(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_t int; v_min int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador monta a seleção da temporada.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  select greatest(1, max(rodada) / 2) into v_min from partidas where liga_id = p_liga and fase = 'liga';
  if v_min is null then return 0; end if;
  insert into premios_individuais (liga_id, temporada, comp, premio, jogador_id, jogador, pos, clube_id, valor, numero)
    select p_liga, v_t, s.grupo, 'sel' || lpad((row_number() over (partition by s.grupo order by s.linha, s.nota desc, s.id))::text, 2, '0'), s.id, s.nome, s.pos, s.clube, 0, s.nota
    from (
      select t.*, row_number() over (partition by t.grupo, t.linha order by t.nota desc, t.j desc, t.id) as rn
      from (
        select u.*, case when u.pos = 'GK' then 1 when u.pos in ('DC', 'SW', 'DR', 'DL', 'WBR', 'WBL') then 2 when u.pos in ('RW', 'LW', 'FC', 'SC') then 4 else 3 end as linha
        from (
          select p.grupo, x.j->>'id' as id, max(x.j->>'nome') as nome, (array_agg(x.j->>'pos' order by p.id desc))[1] as pos,
              (array_agg(case when coalesce((x.j->>'time')::int, 0) = 0 then p.casa else p.fora end order by p.id desc))[1] as clube,
              count(*) as j, round(avg((x.j->>'nota')::numeric), 2) as nota
            from partidas p join resultados r on r.partida_id = p.id
              cross join lateral jsonb_array_elements(coalesce(r.relatorio->'jogadores', '[]'::jsonb)) as x(j)
            where p.liga_id = p_liga and p.fase = 'liga' and r.libera_em <= now()
              and coalesce((x.j->>'minutos')::numeric, 0) >= 30 and (x.j->>'nota') is not null
            group by p.grupo, x.j->>'id' having count(*) >= v_min
        ) u
      ) t
    ) s
    where s.rn <= case s.linha when 1 then 1 when 2 then 4 else 3 end
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.selecao_da_temporada(bigint) from public, anon;
grant execute on function public.selecao_da_temporada(bigint) to authenticated;

-- Registro da safra, agora também trocando o talento de quem já estava no elenco (itens da lista com "jogador_id" e "tal").
create or replace function public.registrar_safra(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador registra a safra.'; end if;
  delete from safras s where s.liga_id = p_liga and s.temporada in (select (value->>'temporada')::int from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)));
  insert into safras (liga_id, temporada, clube_id, jogador, pos, idade, nivel, publico)
    select p_liga, x.temporada, x.clube_id, x.jogador, x.pos, x.idade, x.nivel, coalesce(x.publico, false)
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, temporada int, jogador text, pos text, idade smallint, nivel smallint, publico boolean)
    where exists (select 1 from clubes c where c.id = x.clube_id and c.liga_id = p_liga);
  get diagnostics n = row_count;
  update jogadores_ocultos o set tal = x.tal
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, jogador_id bigint, tal smallint)
    where x.jogador_id is not null and x.tal between 1 and 100 and o.jogador_id = x.jogador_id
      and exists (select 1 from jogadores j join clubes c on c.id = j.clube_id where j.id = x.jogador_id and c.id = x.clube_id and c.liga_id = p_liga and c.dono is null);
  return n;
end $$;
revoke execute on function public.registrar_safra(bigint, jsonb) from public, anon;
grant execute on function public.registrar_safra(bigint, jsonb) to authenticated;

-- ---------- clube formador: o repasse fica anotado na transferência, para poder ser devolvido ----------
alter table public.transferencias add column if not exists formador_clube bigint;
alter table public.transferencias add column if not exists formador_valor int;

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
  new.formador_clube := v_f; new.formador_valor := v_v;
  return new;
end $$;
drop trigger if exists repassar_ao_formador on public.transferencias;
create trigger repassar_ao_formador before insert on public.transferencias for each row execute function public.repassar_ao_formador();

-- Transferência anulada: o repasse volta. Só quando UMA transferência é apagada (a anulação); apagar a liga ou reiniciar o teste
-- apaga muitas de uma vez e não mexe em caixa nenhum.
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
      (t.formador_clube, t.temporada, null, 'formador', -t.formador_valor, 'Transferência anulada: devolução dos 5% de ' || t.jogador);
  end if;
  return null;
end $$;
drop trigger if exists devolver_ao_vendedor on public.transferencias;
create trigger devolver_ao_vendedor after delete on public.transferencias referencing old table as antigas for each statement execute function public.devolver_ao_vendedor();
