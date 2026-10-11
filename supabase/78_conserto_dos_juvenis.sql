-- 78: conserto. Ao criar os países (11/10/2026), o administrador rodou "definir salários e contratos" para a liga inteira,
-- e os juvenis dos clubes com dirigente (que não têm salário nem contrato) ganharam os dois: a folha passou do teto.
-- Tira o salário e o contrato dos juvenis e devolve ao caixa o que as rodadas já cobraram por eles. Pode rodar mais de uma vez.

do $$
declare r record; v_l ligas%rowtype; v_n int; v_valor int;
begin
  for r in select j.clube_id, sum(j.salario)::int as extra from jogadores j
            where j.juvenil and j.salario is not null and j.clube_id is not null group by j.clube_id loop
    select l.* into v_l from ligas l join clubes c on c.liga_id = l.id where c.id = r.clube_id;
    -- rodadas que já pagaram a folha inflada (o defeito entrou depois das 18h20 UTC)
    select count(*) into v_n from lancamentos
      where clube_id = r.clube_id and temporada = v_l.temporada and tipo = 'salarios' and valor < 0 and criado_em >= '2026-10-11 18:20+00';
    v_valor := round(r.extra::numeric * v_n / v_l.rodadas_por_temporada);
    if v_valor > 0 then
      update financas set caixa = caixa + v_valor where clube_id = r.clube_id;
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.clube_id, v_l.temporada, null, 'salarios', v_valor, 'Devolução: salário cobrado dos juvenis por engano');
    end if;
  end loop;
  update jogadores set salario = null, contrato_ate = null where juvenil and salario is not null;
end $$;

-- conferência: tem de dar zero
select count(*) as juvenis_com_salario from public.jogadores where juvenil and salario is not null;
