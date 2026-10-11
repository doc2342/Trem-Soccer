-- Trem Soccer · países, passo 4: mercado entre países. Sai a fronteira fechada do 77_paises.sql e entra o limite de 5 estrangeiros por clube.
-- Estrangeiro = jogador de nacionalidade (jogadores.pais) diferente do país do clube. Conta quem está no clube e quem o clube emprestou.
-- Precisa do 81_libertadores.sql já executado. Pode ser executado mais de uma vez.
-- Depois, REPUBLICAR as funções "rodada" (bots negociam entre países) e "mercado" (reposição com a nacionalidade do clube vendedor).

-- Motivo que impede o clube de receber o jogador, ou null se cabe.
create or replace function public.vaga_de_estrangeiro(p_clube bigint, p_jogador bigint) returns text
language sql stable security definer set search_path = public as $$
  select case when j.pais <> c.pais and (select count(*) from jogadores x
      where (x.clube_id = c.id or x.emprestado_de = c.id) and x.pais <> c.pais and x.id <> j.id) >= 5
    then 'o clube já tem 5 estrangeiros' end
  from jogadores j, clubes c where j.id = p_jogador and c.id = p_clube
$$;
revoke execute on function public.vaga_de_estrangeiro(bigint, bigint) from public, anon;
grant execute on function public.vaga_de_estrangeiro(bigint, bigint) to authenticated, service_role;

-- Um gatilho só para todos os caminhos (multa, venda negociada, empréstimo, jogador livre, mercado dos bots): todos mudam jogadores.clube_id.
-- Só no update: jogador criado (juvenil, reposição, elenco inicial) nasce com a nacionalidade do clube.
-- A volta do empréstimo passa sozinha: o emprestado já contava no clube de origem.
create or replace function public.limite_de_estrangeiros() returns trigger language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if new.clube_id is not null and new.clube_id is distinct from old.clube_id then
    v_motivo := vaga_de_estrangeiro(new.clube_id, new.id);
    if v_motivo is not null then raise exception 'Não dá para trazer %: % (contando os emprestados a outros clubes).', new.nome, v_motivo; end if;
  end if;
  return new;
end $$;
drop trigger if exists fronteira_fechada on public.jogadores;
drop function if exists public.fronteira_fechada();
drop trigger if exists limite_de_estrangeiros on public.jogadores;
create trigger limite_de_estrangeiros before update of clube_id on public.jogadores for each row execute function public.limite_de_estrangeiros();

-- Jogador livre: o lance já é recusado na hora, com o motivo.
create or replace function public.lance_de_estrangeiro() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if vaga_de_estrangeiro(new.clube_id, new.jogador_id) is not null then
    raise exception 'Seu clube já tem 5 estrangeiros (contando os emprestados): não dá para dar lance por um jogador de outro país.';
  end if;
  return new;
end $$;
drop trigger if exists lance_de_estrangeiro on public.ofertas_livres;
create trigger lance_de_estrangeiro before insert on public.ofertas_livres for each row execute function public.lance_de_estrangeiro();

-- resolver_leiloes: igual à do 52_pacote_da_economia.sql, pulando o lance de quem encheu as vagas de estrangeiro depois de dar o lance
-- (sem isto o gatilho derrubaria a resolução inteira, a cada minuto).
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
      if impedimento_de_contrato(o.clube_id, o.salario) is null and vaga_no_elenco(o.clube_id, j.idade) is null and vaga_de_estrangeiro(o.clube_id, j.id) is null then
        v_sal := o.salario;
        if o.clube_id = j.livre_abriu then v_sal := greatest(round(coalesce(j.salario_mercado, 0) * (1 + 0.1 * (o.temporadas - 1)))::int, round(o.salario * 0.9)::int); end if; -- vantagem de quem abriu
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
