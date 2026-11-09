-- Trem Soccer · o olheiro conhece melhor quem joga pelo clube (dono, 08/11/2026).
-- A faixa de teto do próprio elenco estreita com os jogos que o jogador fez PELO CLUBE ATUAL: a largura do olheiro (16 pontos com skill 1,
-- 3 com skill 50) cai à metade a cada 20 jogos; abaixo de 1 ponto, o teto aparece exato. Contam os jogos profissionais (todas as competições
-- da temporada, e as temporadas anteriores pelo jogadores_historico) e os da base (base_jogos: liga de base, Copinha, Libertadores Juvenil),
-- então quem foi formado no clube já chega ao profissional com a faixa mais estreita. Quem troca de clube recomeça do zero.
-- O sorteio que desloca a faixa é o mesmo de antes (teto_em_faixa): cada faixa nova fica DENTRO da anterior, nunca anda para os lados.
-- A folga do teto (1 em 3 jogadores passa 1 ponto do teto do talento, 1 em 18 passa 2; src/treino.js folgaDoTeto) passa a fazer parte do
-- teto que o olheiro mostra: "teto 36" quer dizer que ele para em 36. folga_do_teto repete aqui o mesmo sorteio do JavaScript (mulberry32).
-- As faixas de quem tem folga sobem 1 ou 2 pontos uma vez; os relatórios pagos já comprados são refeitos com o teto novo.
-- Precisa do 36_olheiro.sql (e do 52, que mudou o teto). Como usar: colar no SQL Editor e Run. Pode rodar mais de uma vez. Não exige republicar função.

-- folgaDoTeto do src/treino.js: criarRng(número do jogador × 101 + talento).n(), em contas de 32 bits sem sinal
create or replace function public.folga_do_teto(p_jogador bigint, p_tal int) returns int
language plpgsql immutable set search_path = public as $$
declare m constant numeric := 4294967296; a bigint; t bigint; r numeric;
begin
  if p_tal is null or p_jogador is null then return 0; end if;
  a := mod(mod(p_jogador * 101 + p_tal, m::bigint) + m::bigint, m::bigint); if a = 0 then a := 1; end if;
  a := mod(a + 1831565813, m::bigint);                                              -- 0x6d2b79f5
  t := a;
  t := mod((t # (t >> 15))::numeric * (t | 1), m)::bigint;                           -- Math.imul(t ^ (t >>> 15), t | 1)
  t := t # mod(t + mod((t # (t >> 7))::numeric * (t | 61), m), m)::bigint;           -- t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  r := (t # (t >> 14))::numeric / m;
  return case when r < 1 / 18.0 then 2 when r < 1 / 3.0 then 1 else 0 end;
end $$;

-- Teto (com a folga) em faixa, para os relatórios pagos: igual ao do 52, somando a folga
create or replace function public.teto_em_faixa(p_jogador bigint, p_largura numeric, p_chave text) returns int[]
language plpgsql stable security definer set search_path = public as $$
declare v_tal int; v_teto numeric; v_u numeric; v_min numeric;
begin
  select tal into v_tal from jogadores_ocultos where jogador_id = p_jogador;
  v_teto := 23 + 0.20 * coalesce(v_tal, 50) + folga_do_teto(p_jogador, v_tal);
  v_u := (('x' || substr(md5(p_jogador::text || ':' || p_chave), 1, 6))::bit(24)::int) / 16777216.0;
  v_min := v_teto - p_largura * v_u;
  return array[floor(v_min)::int, least(50, ceil(v_min + p_largura)::int)];
end $$;
revoke execute on function public.teto_em_faixa(bigint, numeric, text) from public, anon, authenticated;

-- Jogos de cada jogador pelo clube (profissional + base). Uso interno.
create or replace function public.jogos_vistos_pelo_clube(p_clube bigint) returns table (jogador_id bigint, jogos int)
language sql stable security definer set search_path = public as $$
  with meus as (select id from jogadores where clube_id = p_clube),
  agora as ( -- temporada atual: as partidas ainda existem (a virada apaga)
    select substr(x->>'id', 2)::bigint as id, count(*)::int as n
      from partidas p join resultados r on r.partida_id = p.id
      cross join lateral jsonb_array_elements(r.relatorio->'jogadores') x
     where p_clube in (p.casa, p.fora) and (case when (x->>'time')::int = 0 then p.casa else p.fora end) = p_clube
       and x->>'id' ~ '^j[0-9]+$' and coalesce((x->>'minutos')::numeric, 0) > 0 -- só quem entrou em campo
     group by 1),
  antes as (select h.jogador_id as id, sum(coalesce(h.jogos, 0))::int as n from jogadores_historico h where h.clube_id = p_clube group by 1),
  base as ( -- a base guarda as temporadas anteriores
    select regexp_replace(x->>'id', '\D', '', 'g')::bigint as id, count(*)::int as n
      from base_jogos b cross join lateral jsonb_array_elements(b.dados->'jogadores') x
     where b.processada and p_clube in (b.casa, b.fora) and (case when (x->>'t')::int = 0 then b.casa else b.fora end) = p_clube
       and regexp_replace(coalesce(x->>'id', ''), '\D', '', 'g') <> ''
     group by 1)
  select m.id, (coalesce(a.n, 0) + coalesce(h.n, 0) + coalesce(b.n, 0))::int
    from meus m left join agora a on a.id = m.id left join antes h on h.id = m.id left join base b on b.id = m.id;
$$;
revoke execute on function public.jogos_vistos_pelo_clube(bigint) from public, anon, authenticated;

-- Faixa com a largura já estreitada: mesmo deslocamento do teto_em_faixa; largura abaixo de 1 = o teto arredondado, exato.
create or replace function public.teto_em_faixa_vista(p_jogador bigint, p_largura numeric, p_chave text) returns int[]
language plpgsql stable security definer set search_path = public as $$
declare v_tal int; v_teto numeric; v_u numeric; v_min numeric;
begin
  select tal into v_tal from jogadores_ocultos where jogador_id = p_jogador;
  v_teto := 23 + 0.20 * coalesce(v_tal, 50) + folga_do_teto(p_jogador, v_tal);
  if p_largura < 1 then return array[round(v_teto)::int, round(v_teto)::int]; end if;
  v_u := (('x' || substr(md5(p_jogador::text || ':' || p_chave), 1, 6))::bit(24)::int) / 16777216.0;
  v_min := v_teto - p_largura * v_u;
  return array[floor(v_min)::int, least(50, ceil(v_min + p_largura)::int)];
end $$;
revoke execute on function public.teto_em_faixa_vista(bigint, numeric, text) from public, anon, authenticated;

-- Relatório do olheiro sobre o próprio elenco: agora com a faixa estreitada pelos jogos (e quantos jogos ele já viu)
drop function if exists public.relatorio_do_elenco();
create or replace function public.relatorio_do_elenco() returns table (jogador_id bigint, minimo int, maximo int, jogos int)
language plpgsql stable security definer set search_path = public as $$
declare v_clube bigint; v_skill int; v_largura numeric;
begin
  select id into v_clube from clubes where dono = auth.uid();
  if v_clube is null then return; end if;
  select max(skill) into v_skill from treinadores where clube_id = v_clube and contratado and funcao = 'olheiro';
  if v_skill is null then return; end if;
  v_largura := 16 - 13 * least(50, v_skill) / 50.0;
  return query select v.jogador_id, (x.faixa)[1], (x.faixa)[2], v.jogos
    from jogos_vistos_pelo_clube(v_clube) v
    cross join lateral (select teto_em_faixa_vista(v.jogador_id, v_largura * power(0.5, v.jogos / 20.0), 'o' || v_skill) as faixa) x;
end $$;
revoke execute on function public.relatorio_do_elenco() from public, anon;
grant execute on function public.relatorio_do_elenco() to authenticated;

-- relatórios pagos já comprados: refeitos com o teto que inclui a folga (rodar de novo dá o mesmo)
update relatorios r set minimo = (f.faixa)[1], maximo = (f.faixa)[2]
  from (select r2.clube_id, r2.jogador_id, r2.nivel, teto_em_faixa(r2.jogador_id, case r2.nivel when 1 then 16 when 2 then 8 else 4 end, 'r' || r2.nivel) as faixa
          from relatorios r2) f
 where r.clube_id = f.clube_id and r.jogador_id = f.jogador_id and r.nivel = f.nivel and (r.minimo, r.maximo) is distinct from ((f.faixa)[1], (f.faixa)[2]);
