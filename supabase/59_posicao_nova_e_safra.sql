-- Trem Soccer · base, parte 1: posição nova (o jogador aprende mais uma posição) e safra (os talentos raros de cada temporada).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois, republicar as funções "rodada" (posição nova, teto pela melhor posição, experiência) e "mercado" (peneira com a nota de chegada nova).
-- Pode ser executado mais de uma vez sem apagar dados.
--
-- Posição nova: o dirigente escolhe UMA posição para o jogador aprender. Enquanto aprende, o treino de atributos rende 20% menos.
--   A cada partida de liga ele ganha pontos de posição (mais se jogou nela, menos conforme a idade) e sobe de improvisado a competente e a natural.
--   Cada jogador guarda uma posição aprendida: escolher outra faz a anterior cair para competente. Goleiro fica de fora.
-- Safra: a virada sorteia os poucos jovens de teto 42 e 43 da temporada entre os clubes. Os que vão para clube com dirigente aparecem no mural da liga;
--   os de clube sem dirigente ficam guardados só para o sorteio seguinte (quem ganhou há pouco concorre com metade do peso).

alter table public.jogadores add column if not exists aprende jsonb; -- { "pos": "DMC", "pts": 350 }: posição que está aprendendo (ou já aprendeu) e os pontos do degrau atual

-- O dirigente escolhe a posição nova. p_pos vazio: para de aprender e perde o progresso.
create or replace function public.aprender_posicao(p_jogador bigint, p_pos text) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_antes text; v_fam jsonb;
begin
  select j.* into v_j from jogadores j join clubes c on c.id = j.clube_id where j.id = p_jogador and c.dono = auth.uid() for update of j;
  if v_j.id is null then raise exception 'Esse jogador não é do seu clube.'; end if;
  v_antes := v_j.aprende->>'pos'; v_fam := coalesce(v_j.fam, '{}'::jsonb);
  if p_pos is null or p_pos = '' then
    if v_antes is null then return 'Ele não estava aprendendo nenhuma posição.'; end if;
    if v_fam->>v_antes = 'N' then raise exception '% já aprendeu essa posição. Para trocar, escolha outra.', v_j.nome; end if;
    update jogadores set aprende = null where id = p_jogador;
    return v_j.nome || ' parou de aprender a posição.';
  end if;
  if v_j.pos = 'GK' or p_pos = 'GK' then raise exception 'Goleiro não aprende posição de linha, e jogador de linha não vira goleiro.'; end if;
  if p_pos not in ('DC', 'SW', 'DR', 'DL', 'WBR', 'WBL', 'DMC', 'MC', 'AMC', 'MR', 'ML', 'AMR', 'AML', 'RW', 'LW', 'FC', 'SC') then raise exception 'Posição desconhecida: %.', p_pos; end if;
  if v_fam->>p_pos = 'N' then raise exception '% já é natural nessa posição.', v_j.nome; end if;
  if v_antes is not distinct from p_pos then return v_j.nome || ' já está aprendendo essa posição.'; end if;
  -- cada jogador guarda uma posição aprendida: a anterior deixa de ser natural
  if v_antes is not null and v_antes <> v_j.pos and v_fam->>v_antes = 'N' then v_fam := jsonb_set(v_fam, array[v_antes], '"C"'::jsonb); end if;
  update jogadores set fam = v_fam, aprende = jsonb_build_object('pos', p_pos, 'pts', 0) where id = p_jogador;
  return v_j.nome || ' começa a aprender a posição na próxima rodada.';
end $$;
revoke execute on function public.aprender_posicao(bigint, text) from public, anon;
grant execute on function public.aprender_posicao(bigint, text) to authenticated;

-- Troca a posição principal por outra em que o jogador já é natural. Se era a posição aprendida, a antiga principal passa a ocupar o lugar dela
-- (continua natural, mas é ela que cai para competente se o jogador for aprender outra).
create or replace function public.tornar_principal(p_jogador bigint, p_pos text) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype;
begin
  select j.* into v_j from jogadores j join clubes c on c.id = j.clube_id where j.id = p_jogador and c.dono = auth.uid() for update of j;
  if v_j.id is null then raise exception 'Esse jogador não é do seu clube.'; end if;
  if v_j.pos = 'GK' or p_pos = 'GK' or p_pos = v_j.pos then raise exception 'Escolha outra posição.'; end if;
  if coalesce(v_j.fam->>p_pos, '') <> 'N' then raise exception '% ainda não é natural nessa posição.', v_j.nome; end if;
  update jogadores set pos = p_pos, treino = null,
      fam = jsonb_set(coalesce(fam, '{}'::jsonb), array[v_j.pos], '"N"'::jsonb),
      aprende = case when aprende->>'pos' = p_pos then jsonb_build_object('pos', v_j.pos, 'pts', 0) else aprende end
    where id = p_jogador;
  return v_j.nome || ' mudou de posição principal.';
end $$;
revoke execute on function public.tornar_principal(bigint, text) from public, anon;
grant execute on function public.tornar_principal(bigint, text) to authenticated;

-- Grava o resultado das sessões de treino. Só a função do servidor chama.
-- p_lista: [{ "id": 123, "at": [22 números], "pts": [22 números], "fam": { ... }, "aprende": { "pos", "pts" } }]; os dois últimos só para quem está aprendendo posição.
-- A posição só é gravada se o jogador ainda estiver aprendendo a mesma (o dirigente pode ter trocado entre o cálculo da partida e o apito final).
create or replace function public.aplicar_treino(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set
      at = (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.at) with ordinality as t(v, o)),
      treino_pts = (select array_agg(v::smallint order by o) from jsonb_array_elements_text(x.pts) with ordinality as t(v, o)),
      fam = case when x.fam is not null and x.aprende is not null and j.aprende->>'pos' = x.aprende->>'pos' then x.fam else j.fam end,
      aprende = case when x.aprende is not null and j.aprende->>'pos' = x.aprende->>'pos' then x.aprende else j.aprende end
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, at jsonb, pts jsonb, fam jsonb, aprende jsonb)
    where j.id = x.id and jsonb_array_length(x.at) = 22 and jsonb_array_length(x.pts) = 22;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_treino(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_treino(jsonb) to service_role;

-- ---------- safra ----------
create table if not exists public.safras (
  id bigserial primary key,
  liga_id bigint not null references public.ligas(id) on delete cascade,
  temporada int not null,           -- temporada em que o jovem começa a jogar
  clube_id bigint references public.clubes(id) on delete cascade,
  jogador text, pos text, idade smallint,
  nivel smallint not null,          -- 43 ou 42: o teto de nota
  publico boolean not null default false -- verdadeiro quando foi para clube com dirigente: aparece no mural da liga
);
create index if not exists safras_liga on public.safras (liga_id, temporada);
alter table public.safras enable row level security;
drop policy if exists safras_publicas on public.safras;
create policy safras_publicas on public.safras for select using (publico);
grant select on public.safras to anon, authenticated;

-- O administrador registra a safra logo depois da virada. p_lista: [{ clube_id, temporada, jogador, pos, idade, nivel, publico }].
create or replace function public.registrar_safra(p_liga bigint, p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador registra a safra.'; end if;
  delete from safras s where s.liga_id = p_liga and s.temporada in (select (value->>'temporada')::int from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)));
  insert into safras (liga_id, temporada, clube_id, jogador, pos, idade, nivel, publico)
    select p_liga, x.temporada, x.clube_id, x.jogador, x.pos, x.idade, x.nivel, coalesce(x.publico, false)
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, temporada int, jogador text, pos text, idade smallint, nivel smallint, publico boolean)
    where exists (select 1 from clubes c where c.id = x.clube_id and c.liga_id = p_liga);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.registrar_safra(bigint, jsonb) from public, anon;
grant execute on function public.registrar_safra(bigint, jsonb) to authenticated;

-- O administrador lê quem ganhou talento raro (inclusive clubes sem dirigente), para pesar o sorteio da virada.
create or replace function public.safras_recentes(p_liga bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só o administrador lê a safra inteira.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('clube_id', s.clube_id, 'temporada', s.temporada)) from safras s where s.liga_id = p_liga), '[]'::jsonb);
end $$;
revoke execute on function public.safras_recentes(bigint) from public, anon;
grant execute on function public.safras_recentes(bigint) to authenticated;
