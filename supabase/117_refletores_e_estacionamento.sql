-- Trem Soccer · refletores e estacionamento do estádio (18/10/2026): fixos, atrelados ao nível do estádio, com bônus de público e manutenção.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 55 (definir_publico) e do 68 (manutencao_por_temporada). Não exige republicar função.
--
-- Refletores: todo estádio a partir do nível 4. Público +3%; manutenção +60 mil por temporada.
-- Estacionamento: nível 0 nos níveis 1–2 do estádio, 1 nos 3–4, 2 nos 5–6, 3 nos 7–8. Público +2% por nível; manutenção +40 mil por nível.
-- O bônus multiplica a conta do público em definir_publico (o teto continua sendo os lugares). Mesmos números em src/economia.js (EXTRAS_DO_ESTADIO).
-- Os campos refletores e estacionamento de clubes.estadio_visual deixam de valer: o desenho também segue o nível.

create or replace function public.estacionamento_do_estadio(p_nivel int) returns int language sql immutable as $$
  select (least(8, greatest(1, coalesce(p_nivel, 1))) - 1) / 2
$$;
create or replace function public.bonus_do_estadio(p_nivel int) returns numeric language sql immutable as $$
  select 1 + case when coalesce(p_nivel, 1) >= 4 then 0.03 else 0 end + 0.02 * public.estacionamento_do_estadio(p_nivel)
$$;
create or replace function public.manutencao_extra_do_estadio(p_nivel int) returns int language sql immutable as $$
  select case when coalesce(p_nivel, 1) >= 4 then 60 else 0 end + 40 * public.estacionamento_do_estadio(p_nivel)
$$;

-- manutenção: a conta do 68 mais refletores e estacionamento
create or replace function public.manutencao_por_temporada(p_clube bigint) returns int language sql stable set search_path = public as $$
  select (round(0.20 * (select coalesce(sum((array[0, 250, 750, 1750, 3750, 7750])[n + 1]), 0)
      from clubes c, unnest(array[c.ct_nivel, c.medico_nivel, c.fisio_nivel, c.base_nivel]) n where c.id = p_clube))
    + round(0.04 * coalesce((select (array[0, 1500, 4500, 9500, 17500, 29500, 49500, 79500])[least(8, greatest(1, c.estadio_nivel))] from clubes c where c.id = p_clube), 0))
    + coalesce((select public.manutencao_extra_do_estadio(c.estadio_nivel) from clubes c where c.id = p_clube), 0))::int
$$;

-- público: a conta do 55 vezes o bônus do estádio do mandante
create or replace function public.definir_publico(p_partida bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype; v_l ligas%rowtype; v_c clubes%rowtype;
  v_lugares int; v_carne int; v_publico int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null then return null; end if;
  if v_p.publico is not null then return v_p.publico; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_c from clubes where id = v_p.casa;
  v_lugares := lugares_do_estadio(v_c.estadio_nivel);
  v_carne := case when v_p.fase = 'liga' and v_c.carne_temporada is not distinct from v_l.temporada then least(v_c.carne, v_lugares) else 0 end;
  v_publico := least(v_lugares, greatest(v_carne,
    round((v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)) * atracao_do_jogo(p_partida) * bonus_do_estadio(v_c.estadio_nivel))));
  update partidas set publico = v_publico where id = p_partida;
  return v_publico;
end $$;
revoke execute on function public.definir_publico(bigint) from public, anon;
grant execute on function public.definir_publico(bigint) to authenticated, service_role;
