-- Trem Soccer · conserto: jogador em clube sem salário nem contrato.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
--
-- É o que sobrou do defeito antigo do jogador de reposição (nascia sem atributos e sem salário): os atributos foram consertados
-- pelo SQL 31, mas um deles ficou sem salário, e por isso a virada não renovou o contrato dele.
-- Quem está num clube sem salário recebe a mediana dos salários do clube e contrato até o fim da próxima temporada.

update public.jogadores j set
    salario = m.valor, salario_mercado = coalesce(j.salario_mercado, m.valor),
    contrato_ate = l.temporada + 1, protegido_ate = coalesce(j.protegido_ate, l.temporada)
  from public.clubes c
  join public.ligas l on l.id = c.liga_id
  cross join lateral (
    select (round(percentile_cont(0.5) within group (order by x.salario) / 5.0) * 5)::int as valor
      from public.jogadores x where x.clube_id = c.id and x.salario is not null
  ) m
  where j.clube_id = c.id and j.salario is null and m.valor is not null;

-- conferência: tem de dar zero
select count(*) as sem_salario from public.jogadores where clube_id is not null and salario is null;
