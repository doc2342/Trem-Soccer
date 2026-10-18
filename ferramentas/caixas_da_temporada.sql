-- Caixa de cada clube e o que entrou/saiu na temporada atual, por tipo de lançamento. Só lê, não muda nada.
-- Uso: Supabase > SQL Editor > colar e Run; depois "Download CSV" e mandar o arquivo para análise.
with t as (select temporada from public.ligas limit 1),
mov as (
  select l.clube_id, l.tipo, sum(l.valor) v
  from public.lancamentos l, t where l.temporada = t.temporada
  group by l.clube_id, l.tipo
)
select c.id, c.nome, c.grupo, c.dono is not null as dirigente, f.caixa,
  (select coalesce(sum(j.salario), 0) from public.jogadores j where j.clube_id = c.id) as folha,
  (select coalesce(sum(v), 0) from mov where mov.clube_id = c.id) as saldo_temporada,
  (select jsonb_object_agg(tipo, v order by tipo) from mov where mov.clube_id = c.id) as por_tipo
from public.clubes c join public.financas f on f.clube_id = c.id
order by c.grupo, f.caixa desc;
