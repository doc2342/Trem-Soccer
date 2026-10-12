-- Trem Soccer · destrava o clube com a folha no teto e o elenco no mínimo.
-- Com 16 jogadores com contrato ninguém sai (mínimo), e com a folha no teto nenhum juvenil assina: o clube ficava preso
-- e perdia os juvenis de 21 anos na virada. Agora, com o elenco no mínimo, o primeiro contrato de um juvenil pode passar do teto.
-- Com 17 o clube volta a poder vender ou dispensar; e a exceção só vale de novo quando ele voltar a 16.
-- (A virada já faz o mesmo: renova até completar 16 sem conferir o teto.)
-- Precisa do 76_emprestimo_e_supercopa.sql. Não exige republicar função.

create or replace function public.profissionalizar_jogador(p_user uuid, p_jogador bigint, p_mercado int, p_temporadas int) returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_j jogadores%rowtype; v_l ligas%rowtype; v_sal int; v_teto int; v_folha int; v_ate int; v_contratados int;
begin
  select * into v_c from clubes where dono = p_user;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  select * into v_j from jogadores where id = p_jogador and clube_id = v_c.id for update;
  if v_j.id is null then raise exception 'Esse jogador não é do seu clube.'; end if;
  if not coalesce(v_j.juvenil, false) then raise exception '% já é profissional.', v_j.nome; end if;
  if p_temporadas is null or p_temporadas < 1 or p_temporadas > 3 then raise exception 'O contrato é de 1, 2 ou 3 temporadas.'; end if;
  if coalesce(p_mercado, 0) <= 0 then raise exception 'Salário de mercado não informado.'; end if;
  select count(*) into v_contratados from jogadores where clube_id = v_c.id and not coalesce(juvenil, false);
  if v_contratados >= 30 then raise exception 'O elenco já tem 30 jogadores com contrato.'; end if;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) < 0 then raise exception 'Clube no vermelho: não dá para assinar contrato novo.'; end if;
  v_sal := round(p_mercado * (1 + 0.1 * (p_temporadas - 1)));
  v_teto := teto_do_clube(v_c.id);
  v_folha := folha_do_clube(v_c.id);
  if v_folha + v_sal > v_teto and v_contratados > 16 then raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha + v_sal, v_teto; end if;
  v_ate := v_l.temporada + p_temporadas - case when rodadas_completas(v_l.id) < 9 then 1 else 0 end;
  update jogadores set juvenil = false, salario = v_sal, salario_mercado = p_mercado, contrato_ate = v_ate where id = p_jogador;
  return v_j.nome || ' assinou o primeiro contrato: ' || v_sal || ' mil por temporada, até o fim da temporada ' || v_ate || '.'
    || case when v_folha + v_sal > v_teto then ' A folha ficou acima do teto (' || (v_folha + v_sal) || ' de ' || v_teto || ' mil): enquanto não baixar, o clube não contrata nem renova.' else '' end;
end $$;
revoke execute on function public.profissionalizar_jogador(uuid, bigint, int, int) from public, anon, authenticated;
grant execute on function public.profissionalizar_jogador(uuid, bigint, int, int) to service_role;
