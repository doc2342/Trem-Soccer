-- Trem Soccer · Libertadores Juvenil: as vagas que sobram no Brasil vão só para o grupo A da liga de base (decisão de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Precisa do 101_libertadores_juvenil.sql.
-- Não precisa republicar a função "rodada". Pode ser executado mais de uma vez.
-- Se nenhum jogo da Libertadores Juvenil desta temporada foi jogado, as oitavas são sorteadas de novo com a regra nova.

create or replace function public.montar_libertadores_juvenil(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare v_l ligas%rowtype; v_t int; v_br bigint[]; v_fora bigint[]; v_ini timestamptz; k int;
begin
  select * into v_l from ligas where id = p_liga;
  if v_l.copa is null or jsonb_typeof(v_l.copa->'lib'->'datas') is distinct from 'array' then return 0; end if;
  if exists (select 1 from base_jogos where liga_id = p_liga and temporada = v_l.temporada and fase = 'libjuv') then return 0; end if;
  v_t := v_l.temporada - 1;
  -- Brasil: campeões da liga de base e da Copinha, e depois as melhores campanhas do grupo A da liga de base
  select array_agg(distinct b.clube_id) into v_br from base_campeoes b join clubes c on c.id = b.clube_id
    where b.liga_id = p_liga and b.temporada = v_t and b.grupo <> 'LIBJUV' and c.pais = 'Brasil';
  v_br := coalesce(v_br, '{}');
  v_br := v_br || coalesce((select array_agg(t.clube order by t.pts desc, t.saldo desc, t.gp desc, random()) from (
      select x.clube, sum(case when x.gp > x.gc then 3 when x.gp = x.gc then 1 else 0 end) as pts, sum(x.gp - x.gc) as saldo, sum(x.gp) as gp
        from (select casa as clube, gols_casa as gp, gols_fora as gc from base_jogos where liga_id = p_liga and temporada = v_t and fase is null and grupo = 'A' and gols_casa is not null
              union all select fora, gols_fora, gols_casa from base_jogos where liga_id = p_liga and temporada = v_t and fase is null and grupo = 'A' and gols_casa is not null) x
        join clubes c on c.id = x.clube and c.pais = 'Brasil' and c.liga_id = p_liga
        where not x.clube = any(v_br) group by x.clube) t), '{}');
  v_br := v_br[1:8];
  -- fora: os 2 primeiros de cada país, em ordem de sorteio
  select array_agg(h.clube_id order by random()) into v_fora from historico h join clubes c on c.id = h.clube_id
    where h.liga_id = p_liga and h.temporada = v_t and h.posicao <= 2 and c.pais <> 'Brasil';
  -- ponytail: chave fixa de 8 + 8 (4 países de fora); com outro número de países, ajustar as vagas
  if coalesce(array_length(v_br, 1), 0) <> 8 or coalesce(array_length(v_fora, 1), 0) <> 8 then return 0; end if;
  v_ini := greatest((v_l.copa->'lib'->'datas'->0->>'inicio')::timestamptz, now());
  for k in 1..8 loop
    insert into base_jogos (liga_id, temporada, grupo, rodada, casa, fora, inicio, fase, copinha_fase)
      values (p_liga, v_l.temporada, 'LIBJ', 203, v_br[k], v_fora[k], v_ini, 'libjuv', 3);
  end loop;
  return 8;
end $$;
revoke execute on function public.montar_libertadores_juvenil(bigint) from public, anon, authenticated;

-- temporada em andamento: refaz as oitavas se ainda não houve jogo
delete from public.base_jogos b using public.ligas l
  where b.liga_id = l.id and b.temporada = l.temporada and b.fase = 'libjuv'
    and not exists (select 1 from public.base_jogos x where x.liga_id = l.id and x.temporada = l.temporada and x.fase = 'libjuv' and x.processada);
select public.montar_libertadores_juvenil(id) from public.ligas;
