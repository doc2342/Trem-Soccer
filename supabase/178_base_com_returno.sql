-- Trem Soccer · liga de base com turno e returno (dono, 08/11/2026): os juvenis jogam a mesma quantidade de jogos do profissional,
-- rodada por rodada da liga principal (antes, turno único de 9 rodadas, uma a cada duas da liga). Vale a partir do próximo calendário:
-- montar_liga_de_base não refaz uma temporada que já teve jogo processado, então a temporada em andamento segue como está.
-- O bônus de treino de quem joga cai para a metade por jogo (a função rodada divide pelas rodadas), e a temporada rende o mesmo.
-- O olheiro (176_teto_que_estreita.sql) conta cada jogo da base como 1, e agora a base tem tantos jogos quanto o profissional.
-- Precisa do 80_virada_com_paises.sql. Como usar: colar no SQL Editor e Run. Pode rodar mais de uma vez. Junto: colar a função rodada.
create or replace function public.montar_liga_de_base(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; n int;
begin
  select temporada into v_temp from ligas where id = p_liga;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_temp and processada) then return 0; end if;
  delete from base_jogos where liga_id = p_liga and temporada = v_temp and fase is null;
  insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio)
    select p.liga_id, v_temp, p.grupo, p.rodada, p.casa, p.fora, p.inicio
      from partidas p where p.liga_id = p_liga and p.fase = 'liga' and public.pais_do_grupo(p.grupo) = 'Brasil';
  get diagnostics n = row_count;
  return n;
end $$;
