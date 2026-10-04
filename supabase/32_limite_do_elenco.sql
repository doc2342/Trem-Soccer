-- Trem Soccer · limite do elenco: no máximo 35 jogadores com mais de 21 anos (e 50 no total, contando os jovens).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 25_regras_do_leilao.sql já executado. Pode ser executado mais de uma vez sem apagar dados.
--
-- O limite vale para toda chegada de jogador a um clube: compra pela multa, venda negociada, oferta da liga e jogador livre.
-- Quem já está acima do limite não perde ninguém: só não consegue trazer mais um jogador com mais de 21 anos.
-- Jogador que faz 22 anos dentro do clube continua nele, mesmo que o clube passe de 35.

-- Há vaga para um jogador desta idade no clube? Devolve o motivo de não haver, ou nulo.
create or replace function public.vaga_no_elenco(p_clube bigint, p_idade int) returns text
language sql stable security definer set search_path = public as $$
  select case
    when (select count(*) from jogadores where clube_id = p_clube) >= 50 then 'o elenco já tem 50 jogadores'
    when p_idade > 21 and (select count(*) from jogadores where clube_id = p_clube and idade > 21) >= 35 then 'o elenco já tem 35 jogadores com mais de 21 anos'
    else null end
$$;

-- confere o limite sempre que um jogador chega a um clube, venha de onde vier
create or replace function public.conferir_vaga_no_elenco() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if new.clube_id is not null and (tg_op = 'INSERT' or new.clube_id is distinct from old.clube_id) then
    v_motivo := vaga_no_elenco(new.clube_id, new.idade);
    if v_motivo is not null then raise exception 'Não dá para trazer %: % de destino.', new.nome, v_motivo; end if;
  end if;
  return new;
end $$;
drop trigger if exists vaga_no_elenco on public.jogadores;
create trigger vaga_no_elenco before insert or update of clube_id on public.jogadores
  for each row execute function public.conferir_vaga_no_elenco();

-- leilão dos livres: o lance já avisa se não há vaga, e no fechamento o lance de quem ficou sem vaga é pulado
create or replace function public.resolver_leiloes(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare j record; o record; n int := 0; v_temp int; v_horas numeric; v_sal int;
begin
  select temporada, horas_leilao into v_temp, v_horas from ligas where id = p_liga;
  for j in select x.id, x.livre_abriu, x.salario_mercado, x.idade from jogadores x where x.livre_liga = p_liga and x.clube_id is null and x.livre_ate is not null
            and (x.livre_ate <= now()
              -- acabou a entrada de clubes novos e só um deu lance: não há disputa, o leilão termina
              or (x.livre_inicio + make_interval(secs => (v_horas * 2700)::int) <= now()
                  and (select count(*) from ofertas_livres y where y.jogador_id = x.id) = 1)) loop
    for o in select * from ofertas_livres where jogador_id = j.id order by salario desc, criada_em, id loop
      if impedimento_de_contrato(o.clube_id, o.salario) is null and vaga_no_elenco(o.clube_id, j.idade) is null then
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
  v_motivo := coalesce(impedimento_de_contrato(v_c.id, p_salario), vaga_no_elenco(v_c.id, v_j.idade));
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
