-- Trem Soccer · janela de transferências: abre logo depois da última rodada da liga e fecha pouco antes de a rodada 2 começar.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 22_travas_da_negociacao.sql já executado. Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- Antes: a janela de início ia da virada até o fim da rodada 2.
-- Agora são dois trechos seguidos, que para o dirigente formam uma janela só:
--   'fim'    : da última partida de liga da temporada terminar até a virada (playoffs incluídos);
--   'inicio' : da virada até faltar pouco para a rodada 2 começar (ligas.janela_fecha_min minutos antes; 60 por padrão).
-- A janela do meio continua igual: entre as rodadas 9 e 11.
-- Quem chega no trecho 'fim' é tratado como reforço da temporada seguinte: na virada, a página do administrador chama
-- ajustar_janela_final, que passa esses registros para a temporada nova (proteção contra a multa, limites de compra e contagem de janelas).

alter table public.ligas add column if not exists janela_fecha_min numeric not null default 60;
-- liga em ritmo de teste (transmissão de poucos minutos): fecha 2 minutos antes da rodada 2
update public.ligas set janela_fecha_min = 2 where minutos_transmissao < 30 and janela_fecha_min = 60;

create or replace function public.janela_do_mercado(p_liga bigint) returns text
language sql stable security definer set search_path = public as $$
  select case
    when rodadas_completas(p_liga) >= l.rodadas_por_temporada
         and not exists (select 1 from partidas p where p.liga_id = p_liga and p.fase = 'liga' and p.fim > now()) then 'fim'
    when rodadas_completas(p_liga) < 2
         and coalesce(now() < (select min(p.inicio) from partidas p where p.liga_id = p_liga and p.fase = 'liga' and p.rodada = 2)
                              - make_interval(secs => (l.janela_fecha_min * 60)::int), true) then 'inicio'
    when rodadas_completas(p_liga) in (9, 10) then 'meio'
    else null end
  from ligas l where l.id = p_liga
$$;
grant execute on function public.janela_do_mercado(bigint) to anon, authenticated;

-- posição da janela na linha do tempo: o trecho 'fim' da temporada T vale o mesmo que o 'inicio' da T+1
create or replace function public.indice_da_janela(p_temporada int, p_janela text) returns int language sql immutable as $$
  select p_temporada * 2 + case p_janela when 'meio' then 1 when 'fim' then 2 else 0 end
$$;

-- Taxa da venda negociada: 30% na primeira janela depois da chegada do jogador (e na mesma), 20% na segunda, 10% da terceira em diante.
create or replace function public.taxa_da_venda(p_jogador bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when j.chegou_temporada is null then 0.10
    when indice_da_janela(l.temporada, janela_do_mercado(l.id)) - indice_da_janela(j.chegou_temporada, j.chegou_janela) <= 1 then 0.30
    when indice_da_janela(l.temporada, janela_do_mercado(l.id)) - indice_da_janela(j.chegou_temporada, j.chegou_janela) = 2 then 0.20
    else 0.10 end
  from jogadores j join clubes c on c.id = j.clube_id join ligas l on l.id = c.liga_id where j.id = p_jogador
$$;
grant execute on function public.taxa_da_venda(bigint) to anon, authenticated;

-- Depois da virada: quem chegou no trecho 'fim' da temporada que acabou passa a contar como reforço da temporada nova. Só administrador.
create or replace function public.ajustar_janela_final(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_temp int; n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador.'; end if;
  select temporada into v_temp from ligas where id = p_liga;
  update jogadores set chegou_temporada = v_temp, chegou_janela = 'inicio', protegido_ate = greatest(coalesce(protegido_ate, v_temp), v_temp)
    where chegou_janela = 'fim' and clube_id in (select id from clubes where liga_id = p_liga);
  get diagnostics n = row_count;
  update transferencias set temporada = v_temp, janela = 'inicio' where liga_id = p_liga and janela = 'fim';
  return n;
end $$;
revoke execute on function public.ajustar_janela_final(bigint) from public, anon;
grant execute on function public.ajustar_janela_final(bigint) to authenticated;
