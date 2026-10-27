-- Trem Soccer · 158: no reinício, os jogadores dos bots já têm multa rescisória na temporada 0 (decidido em 26/10/2026).
-- O reinício gravou todo mundo com protegido_ate = 0 ("primeira temporada no clube"), e o bot não negocia: sem a multa, ninguém comprava de bot.
-- Os elencos dos dirigentes continuam protegidos na primeira temporada; entre eles vale a proposta.
-- Só mexe em quem o reinício gerou (chegou_temporada nulo) em clube sem dono fora do grupo X, e só na temporada 0.
-- Como usar: SQL Editor, colar e Run. Pode rodar mais de uma vez. Não precisa republicar função; o admin.html novo já gera assim no próximo reinício.
update public.jogadores j set protegido_ate = null
  from public.clubes c join public.ligas l on l.id = c.liga_id
  where c.id = j.clube_id and c.dono is null and c.grupo <> 'X' and l.temporada = 0
    and j.protegido_ate = 0 and j.chegou_temporada is null and not coalesce(j.juvenil, false);
