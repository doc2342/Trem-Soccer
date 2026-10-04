-- Trem Soccer · regras do leilão dos jogadores livres (decididas em 4 de outubro de 2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 21_jogadores_livres.sql já executado. Substitui o 24 (não faz mal ter rodado, nem faz falta). Pode ser executado mais de uma vez.
--
-- 1. O leilão começa no primeiro lance e dura ligas.horas_leilao (48 horas).
-- 2. Clubes novos só entram nos primeiros três quartos do prazo (36 horas). Depois, só disputa quem já deu lance.
--    Se ao fim desse período só um clube deu lance, o leilão acaba ali e ele assina.
-- 3. Lance nos últimos 3 minutos estende o leilão para 3 minutos depois do lance, e precisa superar o maior lance em 5%.
-- 4. Cada clube participa de no máximo 3 leilões ao mesmo tempo (cobrir lance dentro deles é livre).
-- 5. Quem abriu o leilão e termina na frente assina por 10% a menos (nunca abaixo do que o jogador pede).
-- 6. Nenhum leilão termina entre 23h e 6h59 (horário de Brasília): o fim vai para as 7h. (Não vale para prazos de teste, menores que 12 horas.)

alter table public.jogadores add column if not exists livre_inicio timestamptz;                                   -- hora do primeiro lance
alter table public.jogadores add column if not exists livre_abriu bigint references public.clubes on delete set null; -- clube que abriu o leilão

-- quem está livre e sem lance volta a esperar o primeiro lance; leilão em andamento ganha início e dono pelo primeiro lance
update public.jogadores j set livre_ate = null, livre_inicio = null, livre_abriu = null
  where j.livre_liga is not null and j.clube_id is null and not exists (select 1 from public.ofertas_livres o where o.jogador_id = j.id);
update public.jogadores j set
    livre_inicio = (select min(o.criada_em) from public.ofertas_livres o where o.jogador_id = j.id),
    livre_abriu = (select o.clube_id from public.ofertas_livres o where o.jogador_id = j.id order by o.criada_em, o.id limit 1)
  where j.livre_liga is not null and j.clube_id is null and j.livre_inicio is null and exists (select 1 from public.ofertas_livres o where o.jogador_id = j.id);

-- Fim do leilão que começa em p_inicio: p_horas depois, sem cair entre 23h e 6h59 de Brasília.
create or replace function public.fim_do_leilao(p_inicio timestamptz, p_horas numeric) returns timestamptz
language plpgsql stable set search_path = public as $$
declare f timestamptz; l timestamp;
begin
  f := p_inicio + make_interval(secs => (p_horas * 3600)::int);
  if p_horas < 12 then return f; end if;
  l := f at time zone 'America/Sao_Paulo';
  if l::time >= time '23:00' then return (date_trunc('day', l) + interval '1 day 7 hours') at time zone 'America/Sao_Paulo'; end if;
  if l::time < time '07:00' then return (date_trunc('day', l) + interval '7 hours') at time zone 'America/Sao_Paulo'; end if;
  return f;
end $$;

-- Na virada: os jogadores com contrato vencido dos clubes com dirigente ficam livres, à espera do primeiro lance.
create or replace function public.liberar_jogadores(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador libera jogadores.'; end if;
  delete from jogadores where livre_liga = p_liga;
  update jogadores j set clube_id = null, livre_liga = p_liga, livre_ate = null, livre_inicio = null, livre_abriu = null, salario = null, salario_mercado = x.salario_mercado,
      contrato_ate = null, protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, salario_mercado int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.liberar_jogadores(bigint, jsonb) from public, anon;
grant execute on function public.liberar_jogadores(bigint, jsonb) to authenticated;

-- Assina com o jogador livre. Uso interno.
create or replace function public.contratar_livre(p_jogador bigint, p_clube bigint, p_salario int, p_temporadas int) returns void
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_j jogadores%rowtype;
begin
  select l.* into v_l from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube;
  select * into v_j from jogadores where id = p_jogador;
  update jogadores set clube_id = p_clube, livre_liga = null, livre_ate = null, livre_inicio = null, livre_abriu = null, salario = p_salario,
    contrato_ate = v_l.temporada + p_temporadas, protegido_ate = v_l.temporada, chegou_temporada = v_l.temporada, chegou_janela = coalesce(janela_do_mercado(v_l.id), 'inicio')
    where id = p_jogador;
  delete from ofertas_livres where jogador_id = p_jogador;
  insert into transferencias (liga_id, temporada, janela, tipo, jogador_id, jogador, pos, de_clube, para_clube, valor)
    values (v_l.id, v_l.temporada, janela_do_mercado(v_l.id), 'livre', v_j.id, v_j.nome, v_j.pos, null, p_clube, 0);
end $$;
revoke execute on function public.contratar_livre(bigint, bigint, int, int) from public, anon, authenticated;

-- Fecha o que venceu: leilões de livres (leva o maior salário entre os lances que ainda cabem no clube) e ofertas à liga de
-- clubes no vermelho que ninguém comprou (o jogador vai ao banco por 60% da multa). Pode ser chamada por qualquer um, quantas vezes for.
create or replace function public.resolver_leiloes(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare j record; o record; n int := 0; v_temp int; v_horas numeric; v_sal int;
begin
  select temporada, horas_leilao into v_temp, v_horas from ligas where id = p_liga;
  for j in select x.id, x.livre_abriu, x.salario_mercado from jogadores x where x.livre_liga = p_liga and x.clube_id is null and x.livre_ate is not null
            and (x.livre_ate <= now()
              -- acabou a entrada de clubes novos e só um deu lance: não há disputa, o leilão termina
              or (x.livre_inicio + make_interval(secs => (v_horas * 2700)::int) <= now()
                  and (select count(*) from ofertas_livres y where y.jogador_id = x.id) = 1)) loop
    for o in select * from ofertas_livres where jogador_id = j.id order by salario desc, criada_em, id loop
      if impedimento_de_contrato(o.clube_id, o.salario) is null then
        v_sal := o.salario;
        if o.clube_id = j.livre_abriu then v_sal := greatest(coalesce(j.salario_mercado, 0), round(o.salario * 0.9)::int); end if; -- vantagem de quem abriu
        perform contratar_livre(j.id, o.clube_id, v_sal, o.temporadas);
        n := n + 1;
        exit;
      end if;
    end loop;
    -- se nenhum lance coube, o jogador segue livre, sem lances, à espera de um novo primeiro lance
    delete from ofertas_livres where jogador_id = j.id;
    update jogadores set livre_ate = null, livre_inicio = null, livre_abriu = null where id = j.id and clube_id is null;
  end loop;
  for j in select x.id, x.nome, x.salario, x.clube_id from jogadores x join clubes c on c.id = x.clube_id
            where c.liga_id = p_liga and x.oferta_liga_ate is not null and x.oferta_liga_ate <= now() loop
    if (select count(*) from jogadores where clube_id = j.clube_id) > 16 and coalesce((select caixa from financas where clube_id = j.clube_id), 0) < 0 then
      delete from jogadores where id = j.id;
      update financas set caixa = caixa + 3 * coalesce(j.salario, 0) where clube_id = j.clube_id;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (j.clube_id, v_temp, null, 'banco', 3 * coalesce(j.salario, 0), 'Oferta à liga sem comprador, vendido ao banco: ' || j.nome);
      n := n + 1;
    else
      update jogadores set oferta_liga_ate = null where id = j.id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.resolver_leiloes(bigint) from public, anon;
grant execute on function public.resolver_leiloes(bigint) to authenticated, service_role;

-- Lance por um jogador livre (regras no topo do arquivo).
create or replace function public.dar_lance_livre(p_jogador bigint, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_j jogadores%rowtype;
  v_horas numeric; v_maior int; v_meu int; v_minimo int; v_motivo text; v_fim timestamptz; v_final boolean;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  perform resolver_leiloes(v_c.liga_id);
  select horas_leilao into v_horas from ligas where id = v_c.liga_id;
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.clube_id is not null or v_j.livre_liga is distinct from v_c.liga_id then raise exception 'Esse jogador não está livre.'; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario_mercado, 0) then raise exception 'Ele pede pelo menos % mil por temporada.', coalesce(v_j.salario_mercado, 0); end if;
  select salario into v_meu from ofertas_livres where jogador_id = p_jogador and clube_id = v_c.id;
  if v_meu is null then -- clube novo neste leilão
    if v_j.livre_inicio is not null and now() > v_j.livre_inicio + make_interval(secs => (v_horas * 2700)::int) then
      raise exception 'A entrada de clubes novos neste leilão já fechou: agora só disputa quem deu lance antes.';
    end if;
    if (select count(*) from ofertas_livres o join jogadores x on x.id = o.jogador_id where o.clube_id = v_c.id and x.clube_id is null) >= 3 then
      raise exception 'Você já está em 3 leilões ao mesmo tempo. Espere um deles acabar para entrar em outro.';
    end if;
  end if;
  v_motivo := impedimento_de_contrato(v_c.id, p_salario);
  if v_motivo is not null then raise exception 'Não dá para fazer esse lance: %.', v_motivo; end if;
  select max(salario) into v_maior from ofertas_livres where jogador_id = p_jogador and clube_id <> v_c.id;
  v_final := v_j.livre_ate is not null and v_j.livre_ate - now() <= interval '3 minutes';
  if v_maior is not null then
    v_minimo := case when v_final then ceil(v_maior * 1.05)::int else v_maior + 1 end;
    if p_salario < v_minimo then
      if v_final then raise exception 'Na reta final o lance precisa superar o maior em 5%%: pelo menos % mil.', v_minimo; end if;
      raise exception 'Já existe um lance de % mil. O seu precisa ser maior.', v_maior;
    end if;
  end if;
  v_fim := v_j.livre_ate;
  if v_fim is null then -- primeiro lance: o prazo começa agora, e este clube fica com a vantagem de quem abriu
    v_fim := fim_do_leilao(now(), v_horas);
    update jogadores set livre_ate = v_fim, livre_inicio = now(), livre_abriu = v_c.id where id = p_jogador;
  elsif v_final and v_maior is not null and coalesce(v_meu, 0) <= v_maior then -- lance que toma a frente nos últimos 3 minutos: estende
    v_fim := now() + interval '3 minutes';
    update jogadores set livre_ate = v_fim where id = p_jogador;
  end if;
  insert into ofertas_livres (jogador_id, clube_id, salario, temporadas) values (p_jogador, v_c.id, p_salario, p_temporadas)
    on conflict (jogador_id, clube_id) do update set salario = excluded.salario, temporadas = excluded.temporadas, criada_em = now();
  return 'Lance registrado. O leilão termina em ' || to_char(v_fim at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.dar_lance_livre(bigint, int, int) from public, anon;
grant execute on function public.dar_lance_livre(bigint, int, int) to authenticated;
