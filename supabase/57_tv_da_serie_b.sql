-- Trem Soccer · direitos de TV da Série B de 4,5 para 5,3 mi por temporada.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- A revisão da economia de 5 de outubro de 2026 mostrou que a Série B era a divisão mais apertada: a receita média (14,25 mi) mal passava
-- do teto de folha (14 mi), e um clube com comissão e estruturas só conseguia pagar 80% do teto, contra 87% na Série A e 98% na C.
-- Com 0,8 mi a mais de TV, a Série B chega a uns 86%. Vale a partir da próxima rodada de liga (a TV é paga rodada a rodada).

update public.divisoes set receita_tv = 5300 where divisao = 2 and receita_tv = 4500;

-- ligas criadas daqui para a frente já nascem com o valor novo
create or replace function public.criar_divisoes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into divisoes (liga_id, divisao, teto_folha, receita_tv, receita_patrocinio, preco_ingresso, torcida_base) values
    (new.id, 1, 20000, 6500, 5200, 25, 20000),
    (new.id, 2, 14000, 5300, 3600, 24, 14000),
    (new.id, 3, 10000, 4200, 3400, 22, 10000)
  on conflict do nothing;
  return new;
end $$;
