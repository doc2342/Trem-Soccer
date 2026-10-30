-- Trem Soccer · 166: o goleiro se aposenta mais tarde (G1 do pacote tático, aprovado em 30/10; vale sempre, não só na T1).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 125_aposentadoria_mais_tarde.sql. Depois: nada (a virada do site lê chanceDeAposentar em src/virada.js, que já tem a mesma regra).
--
-- Linha: anúncio a partir dos 34 (vira 35 na virada), 20% por ano. Goleiro: a partir dos 36 (vira 37), 20% aos 37, 40% aos 38, 60% aos 39.
-- Quem tem 39 se aposenta obrigatoriamente (ninguém joga com 40), goleiro também. Só a função do anúncio muda; o resto é o do 125.

create or replace function public.anunciar_aposentadorias(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; n int;
begin
  select * into v_l from ligas where id = p_liga for update;
  if v_l.id is null or v_l.aposentadorias_em is not distinct from v_l.temporada then return 0; end if;
  if not (case when v_l.janela_meio_fecha is not null then now() > v_l.janela_meio_fecha else rodadas_completas(p_liga) >= 11 end) then return 0; end if;
  update jogadores j set aposenta_em = v_l.temporada
    where (j.clube_id in (select id from clubes where liga_id = p_liga) or j.livre_liga = p_liga)
      and j.aposenta_em is null
      and (j.idade + 1 >= 40
        or (j.idade + 1 >= (case when j.pos = 'GK' then 37 else 35 end) and (j.contrato_ate is null or j.contrato_ate <= v_l.temporada)
            and random() < (j.idade + 1 - (case when j.pos = 'GK' then 36 else 34 end)) * 0.2));
  get diagnostics n = row_count;
  update ligas set aposentadorias_em = v_l.temporada where id = p_liga;
  return n;
end $$;
