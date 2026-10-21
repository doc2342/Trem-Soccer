-- Trem Soccer · tetos revistos para o Brasil com duas divisões (A e B em três grupos) e para os países.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois: publicar o site (publicar.py, por causa do virada.js) e republicar a função rodada (os bots leem o teto dos países nela).
-- Pode ser executado mais de uma vez.
--
-- Os tetos foram pensados para três divisões (20/14/10 mi). Com a B no degrau de baixo, os 24 clubes dela ficaram presos em ~36 de força,
-- 4 pontos abaixo da média da A, e quem sobe chega sem chance. Todo clube gasta perto de 100% do teto, então o teto é também o teto de
-- qualidade: +12% de teto ≈ +1 ponto de nota no time.
--   Série B: teto 14 → 16 mi; TV 5,3 → 6,4 mi e patrocínio 3,6 → 4,5 mi (+2 mi de receita, o mesmo que o teto subiu: o saldo da B não piora).
--   Países: teto 24 → 20 mi, o mesmo da Série A (e o mesmo valor de REGUA_DE_FORA.teto em src/virada.js e de botsDaLiga no empacotar_funcao.py).
--     Com 24 mi eles estavam em ~80% do teto e iam ganhar 1,3 a 1,6 ponto em duas temporadas, gastando 5 a 6 mi de caixa cada.
--     Com 20 mi a força fica onde está: na próxima virada saem pelo teto só os renovados mais caros de quem passa dele (3 a 6 por país).
--     Ninguém é cortado no meio da temporada; até a virada, só ficam travadas contratação e renovação acima do teto.
-- A TV entra já na próxima rodada de liga (é paga rodada a rodada). O patrocínio novo vale para os bots já e para os dirigentes no próximo
-- contrato (o desta temporada travou na 1ª rodada).

update public.divisoes set teto_folha = 16000, receita_tv = 6400, receita_patrocinio = 4500
  where divisao = 2 and teto_folha = 14000;

create or replace function public.teto_do_clube(p_clube bigint) returns int
language sql stable security definer set search_path = public as $$
  select case when c.pais <> 'Brasil' then 20000 else coalesce((select d.teto_folha from divisoes d
      where d.liga_id = c.liga_id and d.divisao = case when c.paraquedas = l.temporada then greatest(1, c.divisao - 1) else c.divisao end),
    l.teto_folha) end
  from clubes c join ligas l on l.id = c.liga_id where c.id = p_clube
$$;
grant execute on function public.teto_do_clube(bigint) to anon, authenticated;

-- ligas criadas daqui para a frente já nascem com os valores novos
create or replace function public.criar_divisoes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into divisoes (liga_id, divisao, teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base) values
    (new.id, 1, 20000, 6500, 5200, 25, 20000),
    (new.id, 2, 16000, 6400, 4500, 24, 14000),
    (new.id, 3, 10000, 4200, 3400, 22, 10000)
  on conflict do nothing;
  return new;
end $$;

-- conferência: deve mostrar a divisão 2 com 16000 / 6400 / 4500 e um clube de fora com 20000
select divisao, teto_folha, receita_tv, receita_patrocinio from divisoes where liga_id = 1 order by divisao;
select distinct on (c.grupo) c.grupo, c.nome, c.pais, c.divisao, teto_do_clube(c.id) from clubes c where c.liga_id = 1 and c.grupo in ('A', 'B', 'ARG') order by c.grupo, c.id;
