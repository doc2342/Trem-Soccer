-- Trem Soccer · ajuste do M3: o leilão do jogador livre só começa a contar no primeiro lance.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 21_jogadores_livres.sql já executado. Pode ser executado mais de uma vez sem apagar dados.
-- Antes: o prazo corria desde a virada e, vencido sem lance, o primeiro a oferecer assinava na hora.
-- Agora: livre_ate fica vazio enquanto ninguém deu lance; o primeiro lance abre o prazo (ligas.horas_leilao) e os outros clubes têm esse tempo para cobrir.

-- quem está livre e sem lance volta a esperar o primeiro lance
update public.jogadores j set livre_ate = null
  where j.livre_liga is not null and j.clube_id is null and not exists (select 1 from public.ofertas_livres o where o.jogador_id = j.id);

-- Na virada: os jogadores com contrato vencido dos clubes com dirigente ficam livres, à espera do primeiro lance.
-- Quem ficou livre na virada anterior e ninguém contratou sai do jogo. p_lista: [{ id, salario_mercado }]. Só administrador.
create or replace function public.liberar_jogadores(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador libera jogadores.'; end if;
  delete from jogadores where livre_liga = p_liga;
  update jogadores j set clube_id = null, livre_liga = p_liga, livre_ate = null, salario = null, salario_mercado = x.salario_mercado,
      contrato_ate = null, protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, salario_mercado int)
    where j.id = x.id and j.clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.liberar_jogadores(bigint, jsonb) from public, anon;
grant execute on function public.liberar_jogadores(bigint, jsonb) to authenticated;

-- Fecha o que venceu: leilões de livres (leva o maior salário entre os lances que ainda cabem no clube) e ofertas à liga de
-- clubes no vermelho que ninguém comprou (o jogador vai ao banco por 60% da multa). Pode ser chamada por qualquer um, quantas vezes for.
create or replace function public.resolver_leiloes(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare j record; o record; n int := 0; v_temp int;
begin
  select temporada into v_temp from ligas where id = p_liga;
  for j in select id from jogadores where livre_liga = p_liga and clube_id is null and livre_ate <= now() loop
    for o in select * from ofertas_livres where jogador_id = j.id order by salario desc, criada_em, id loop
      if impedimento_de_contrato(o.clube_id, o.salario) is null then
        perform contratar_livre(j.id, o.clube_id, o.salario, o.temporadas);
        n := n + 1;
        exit;
      end if;
    end loop;
    -- se nenhum lance coube, o jogador segue livre, sem lances, à espera de um novo primeiro lance
    delete from ofertas_livres where jogador_id = j.id;
    update jogadores set livre_ate = null where id = j.id and clube_id is null;
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

-- Lance por um jogador livre. Precisa cobrir o que ele pede e superar o maior lance. O primeiro lance abre o prazo do leilão;
-- quando o prazo acaba, leva o maior salário.
create or replace function public.dar_lance_livre(p_jogador bigint, p_salario int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_j jogadores%rowtype;
  v_maior int; v_motivo text; v_fim timestamptz;
begin
  select * into v_c from clubes where dono = auth.uid();
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  perform resolver_leiloes(v_c.liga_id);
  select * into v_j from jogadores where id = p_jogador for update;
  if v_j.id is null or v_j.clube_id is not null or v_j.livre_liga is distinct from v_c.liga_id then raise exception 'Esse jogador não está livre.'; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario_mercado, 0) then raise exception 'Ele pede pelo menos % mil por temporada.', coalesce(v_j.salario_mercado, 0); end if;
  v_motivo := impedimento_de_contrato(v_c.id, p_salario);
  if v_motivo is not null then raise exception 'Não dá para fazer esse lance: %.', v_motivo; end if;
  select max(salario) into v_maior from ofertas_livres where jogador_id = p_jogador and clube_id <> v_c.id;
  if v_maior is not null and p_salario <= v_maior then raise exception 'Já existe um lance de % mil. O seu precisa ser maior.', v_maior; end if;
  v_fim := v_j.livre_ate;
  if v_fim is null then -- primeiro lance: o prazo começa agora
    select now() + make_interval(secs => (horas_leilao * 3600)::int) into v_fim from ligas where id = v_c.liga_id;
    update jogadores set livre_ate = v_fim where id = p_jogador;
  end if;
  insert into ofertas_livres (jogador_id, clube_id, salario, temporadas) values (p_jogador, v_c.id, p_salario, p_temporadas)
    on conflict (jogador_id, clube_id) do update set salario = excluded.salario, temporadas = excluded.temporadas, criada_em = now();
  return 'Lance registrado. O leilão termina em ' || to_char(v_fim at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || '.';
end $$;
revoke execute on function public.dar_lance_livre(bigint, int, int) from public, anon;
grant execute on function public.dar_lance_livre(bigint, int, int) to authenticated;
