-- Trem Soccer · os 2 juvenis que cada clube ganhou no reinício da liga (T0) aparecem como "virada", não "peneira" (dono, 14/11).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 64_revelados.sql. Não precisa republicar função nem publicar o site. Pode ser executado mais de uma vez.
--
-- O gatilho anotar_revelado só chama de "virada" quem é de uma temporada maior que a da liga; no reinício a liga já estava na 0,
-- então todos viraram "peneira". A virada normal não tem o problema: ela cria os juvenis antes de a liga mudar de temporada.
-- Registros 1226 a 1269 são os do reinício; de 1270 em diante são as peneiras de verdade (Mantuan, Damasceno, General).
update public.revelados set origem = 'virada'
  where temporada = 0 and origem = 'peneira' and id between 1226 and 1269;
