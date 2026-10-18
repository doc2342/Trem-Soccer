-- Trem Soccer · lances em leilões de livres contam na folha, e o lance descartado no fechamento fica registrado com o motivo (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Precisa do 82 e do 88. Pode ser executado mais de uma vez.
--
-- O caso: o dirigente abriu 3 leilões ao mesmo tempo; cada lance cabia sozinho no teto, mas os três juntos não. Os leilões fecharam
-- juntos, o primeiro assinou e os outros dois foram descartados em silêncio (a folha passaria do teto), e a tela dizia "perdeu para"
-- o bot que contratou o jogador depois. Agora:
--   1. dar_lance_livre soma à folha os lances em que o clube está na frente nos outros leilões abertos;
--   2. resolver_leiloes grava em historico_lances.descartado o motivo de cada lance que não coube, e a tela mostra.

alter table public.historico_lances add column if not exists descartado text;

-- salário que o clube já tem prometido em leilões abertos onde está na frente (fora o deste jogador); o desconto de quem abriu não entra
create or replace function public.folha_em_leiloes(p_clube bigint, p_exceto bigint default null) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(o.salario), 0)::int from ofertas_livres o join jogadores x on x.id = o.jogador_id
   where o.clube_id = p_clube and x.clube_id is null and o.jogador_id is distinct from p_exceto
     and not exists (select 1 from ofertas_livres y where y.jogador_id = o.jogador_id and y.clube_id <> o.clube_id
                      and (y.salario > o.salario or (y.salario = o.salario and (y.criada_em, y.id) < (o.criada_em, o.id))))
$$;
revoke execute on function public.folha_em_leiloes(bigint, bigint) from public, anon;
grant execute on function public.folha_em_leiloes(bigint, bigint) to authenticated, service_role;

-- copiar_lance_livre: igual à do 88, mas o registro descartado encerra aquele leilão (o lance seguinte abre um registro novo)
create or replace function public.copiar_lance_livre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update historico_lances h set salario = new.salario, temporadas = new.temporadas
   where h.jogador_id = new.jogador_id and h.clube_id = new.clube_id and h.descartado is null
     and h.criada_em = (select max(criada_em) from historico_lances where jogador_id = new.jogador_id and clube_id = new.clube_id)
     and not exists (select 1 from transferencias t where t.jogador_id = new.jogador_id and t.criada_em > h.criada_em);
  if not found then
    insert into historico_lances (jogador_id, clube_id, salario, temporadas) values (new.jogador_id, new.clube_id, new.salario, new.temporadas);
  end if;
  return new;
end $$;

-- dar_lance_livre: igual à do 32, com a folha dos outros leilões somada
create or replace function public.dar_lance_livre(p_jogador bigint, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_j jogadores%rowtype;
  v_horas numeric; v_maior int; v_meu int; v_minimo int; v_motivo text; v_fim timestamptz; v_final boolean; v_folha int; v_leiloes int; v_teto int;
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
  v_motivo := coalesce(impedimento_de_contrato(v_c.id, p_salario), vaga_no_elenco(v_c.id, v_j.idade));
  if v_motivo is not null then raise exception 'Não dá para fazer esse lance: %.', v_motivo; end if;
  v_leiloes := folha_em_leiloes(v_c.id, p_jogador);
  if v_leiloes > 0 then
    v_folha := folha_do_clube(v_c.id); v_teto := teto_do_clube(v_c.id);
    if v_folha + v_leiloes + p_salario > v_teto then
      raise exception 'Não dá para fazer esse lance: a folha (% mil) mais os lances em que você está na frente em outros leilões (% mil) mais este (% mil) passariam do teto de % mil. Se ganhar todos, os que não couberem são descartados.',
        v_folha, v_leiloes, p_salario, v_teto;
    end if;
  end if;
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

-- resolver_leiloes: igual à do 82, gravando no histórico o motivo de cada lance que não coube
create or replace function public.resolver_leiloes(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare j record; o record; n int := 0; v_temp int; v_horas numeric; v_sal int; v_motivo text;
begin
  select temporada, horas_leilao into v_temp, v_horas from ligas where id = p_liga;
  for j in select x.id, x.livre_abriu, x.salario_mercado, x.idade from jogadores x where x.livre_liga = p_liga and x.clube_id is null and x.livre_ate is not null
            and (x.livre_ate <= now()
              -- acabou a entrada de clubes novos e só um deu lance: não há disputa, o leilão termina
              or (x.livre_inicio + make_interval(secs => (v_horas * 2700)::int) <= now()
                  and (select count(*) from ofertas_livres y where y.jogador_id = x.id) = 1)) loop
    for o in select * from ofertas_livres where jogador_id = j.id order by salario desc, criada_em, id loop
      v_motivo := coalesce(impedimento_de_contrato(o.clube_id, o.salario), vaga_no_elenco(o.clube_id, j.idade), vaga_de_estrangeiro(o.clube_id, j.id));
      if v_motivo is null then
        v_sal := o.salario;
        if o.clube_id = j.livre_abriu then v_sal := greatest(round(coalesce(j.salario_mercado, 0) * (1 + 0.1 * (o.temporadas - 1)))::int, round(o.salario * 0.9)::int); end if; -- vantagem de quem abriu
        perform contratar_livre(j.id, o.clube_id, v_sal, o.temporadas);
        n := n + 1;
        exit;
      end if;
      update historico_lances h set descartado = v_motivo
       where h.jogador_id = j.id and h.clube_id = o.clube_id
         and h.criada_em = (select max(criada_em) from historico_lances where jogador_id = j.id and clube_id = o.clube_id);
    end loop;
    -- se nenhum lance coube, o jogador segue livre, sem lances, à espera de um novo primeiro lance
    delete from ofertas_livres where jogador_id = j.id;
    update jogadores set livre_ate = null, livre_inicio = null, livre_abriu = null where id = j.id and clube_id is null;
  end loop;
  for j in select x.id, x.nome, x.salario, x.clube_id from jogadores x join clubes c on c.id = x.clube_id
            where c.liga_id = p_liga and x.oferta_liga_ate is not null and x.oferta_liga_ate <= now() loop
    if (select count(*) from jogadores where clube_id = j.clube_id) > 16 and coalesce((select caixa from financas where clube_id = j.clube_id), 0) < 0 then
      perform venda_automatica(j.id, 'Oferta à liga sem comprador, vendido pelo agente: ');
      n := n + 1;
    else
      update jogadores set oferta_liga_ate = null where id = j.id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.resolver_leiloes(bigint) from public, anon;
grant execute on function public.resolver_leiloes(bigint) to authenticated, service_role;

-- o Xandao Maresia do bnetto (clube 45), descartado em 18/10 às 19h52 (Brasília), antes deste arquivo
-- (o Wanderson Itacare não: o lance refeito às 20h13 reaproveitou o mesmo registro, e o fechamento dele já grava o motivo)
update historico_lances set descartado = 'a folha passaria do teto' where clube_id = 45 and jogador_id = 2909 and descartado is null;
