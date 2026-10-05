-- Trem Soccer · Copa do Brasil: a campanha de cada clube fica guardada no histórico da temporada.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 49_copa_premios_e_bilheteria.sql já executado. Não precisa republicar nenhuma função. Pode ser executado mais de uma vez.
--
-- Na virada, antes de as partidas da temporada serem apagadas, o jogo anota em historico.copa até onde cada clube chegou:
-- 'campeão', 'vice', 'final' (se a virada vier antes da final), 'semifinal', 'quartas', 'oitavas', 'fase de 32' ou 'preliminar' (nulo: não jogou a copa).

alter table public.historico add column if not exists copa text;

-- Até onde cada clube chegou na copa desta temporada: { "id do clube": "fase" }. Vazio se não houve copa.
create or replace function public.copa_campanhas(p_liga bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  with jogos as (
    select p.copa_fase, p.casa, p.fora,
           coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint,
                    case when r.gols_fora > r.gols_casa then p.fora when r.partida_id is not null then p.casa end) as vencedor
      from partidas p left join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'copa'
  ), por_clube as (
    select clube, max(copa_fase) as fase, bool_or(copa_fase = 6 and vencedor = clube) as campeao, bool_or(copa_fase = 6 and vencedor is not null) as final_jogada
      from (select copa_fase, casa as clube, vencedor from jogos union all select copa_fase, fora, vencedor from jogos) x
      group by clube
  )
  select coalesce(jsonb_object_agg(clube::text,
           case when campeao then 'campeão' when fase = 6 and not final_jogada then 'final'
                else (array['preliminar', 'fase de 32', 'oitavas', 'quartas', 'semifinal', 'vice'])[fase] end), '{}'::jsonb)
    from por_clube
$$;
revoke execute on function public.copa_campanhas(bigint) from public, anon;
grant execute on function public.copa_campanhas(bigint) to authenticated, service_role;

-- a virada guarda a campanha da copa no histórico, zera os cartões da copa e a trava de clube
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_texto text; v_temporada int; v_copa jsonb;
begin
  select temporada into v_temporada from ligas where id = p_liga;
  v_copa := copa_campanhas(p_liga); -- antes da virada, que apaga as partidas
  perform set_config('trem.virada', '1', true);
  v_texto := virar_temporada(p_liga, p_plano);
  if v_copa <> '{}'::jsonb then
    update historico h set copa = v_copa->>h.clube_id::text
      where h.liga_id = p_liga and h.temporada = v_temporada and v_copa ? h.clube_id::text;
  end if;
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null, copa = null where id = p_liga;
  update jogadores set amarelos_copa = null, fora_copa = null, copa_clube = null
    where (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga)
      and (amarelos_copa is not null or fora_copa is not null or copa_clube is not null);
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;
