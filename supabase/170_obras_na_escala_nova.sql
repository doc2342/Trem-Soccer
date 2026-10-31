-- Trem Soccer · 170: as obras em andamento passam para a escala do 169 (31/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 169 já executado. Depois: nada (não precisa publicar site nem função).
--
-- O 169 trocou os prazos (1, 4, 8, 14… → 1, 3, 6, 10…) só para as obras novas; as de antes ficaram na escala do 167. Aqui o que falta
-- de cada uma encolhe na mesma proporção (prazo novo ÷ prazo antigo), em dias cheios para baixo, no mínimo 1; a hora de entrega fica.
-- Ex.: estádio para o nível 2, 3 dias faltando: 3 × 3/4 = 2,25 → 2 dias. Só mexe em obra com prazo maior que o da escala nova, então
-- rodar de novo não muda nada (depois daqui o prazo total dela já é o novo).

update public.obras o set
  termina_em = o.termina_em - make_interval(secs => (o.rodadas_restantes - n.resta) * 3600 * public.horas_do_dia(n.liga_id)),
  rodadas_restantes = n.resta,
  rodadas_total = n.prazo
from (select x.id, x.liga_id, x.prazo, greatest(1, floor(x.rodadas_restantes * x.prazo::numeric / x.rodadas_total))::int resta
      from (select o2.id, o2.rodadas_restantes, o2.rodadas_total, c.liga_id,
              case when o2.estrutura = 'estadio_modelo' then public.prazo_da_reforma(o2.nivel_alvo) else public.prazo_da_obra(o2.nivel_alvo) end prazo
            from public.obras o2 join public.clubes c on c.id = o2.clube_id where not o2.concluida and o2.termina_em is not null) x
      where x.rodadas_total > x.prazo) n
where o.id = n.id;
