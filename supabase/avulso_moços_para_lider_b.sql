-- Avulso (17/10, T13): o Moços troca do clube 27 (9º da Série B) para o clube 5 (Sport Valentim, líder da B).
-- Troca só a identidade (dono, nome, sigla, escudo, uniforme, datas): elenco, caixa e campanha ficam com cada clube.
-- O 27 volta a ser bot com o nome do Sport Valentim (o nome original dele foi sobrescrito na aprovação).
-- Só roda se o dirigente ainda não entrou depois da aprovação. Rodar uma vez só.
do $$
declare a clubes%rowtype; b clubes%rowtype;
begin
  select * into a from clubes where id = 27 for update;
  select * into b from clubes where id = 5 for update;
  if a.nome <> 'Moços' or a.dono is null or b.dono is not null then raise exception 'Situação mudou: confira os clubes 27 e 5 antes.'; end if;
  if a.ultimo_acesso > a.assumido_em then raise exception 'O dirigente já entrou no clube 27.'; end if;
  update clubes set dono = null, nome = '~troca~', sigla = '~~~' where id = 27; -- libera dono (clubes_dono_pais), nome e sigla
  update clubes set dono = a.dono, nome = a.nome, sigla = a.sigla, escudo = a.escudo, uniforme = a.uniforme,
    assumido_em = a.assumido_em, ultimo_acesso = a.ultimo_acesso where id = 5;
  update clubes set dono = null, nome = b.nome, sigla = b.sigla, escudo = b.escudo, uniforme = b.uniforme,
    assumido_em = null, ultimo_acesso = null where id = 27;
end $$;
select id, nome, sigla, dono is not null as tem_dono from clubes where id in (5, 27);
