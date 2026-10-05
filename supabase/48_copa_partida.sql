-- Trem Soccer · Copa do Brasil, parte 2 (C2): a partida de copa.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 47_copa_calendario_e_chave.sql já executado. Depois, republicar a função "rodada". Pode ser executado mais de uma vez.
--
-- Na partida de copa (tudo calculado pela função "rodada"): campo neutro, prorrogação jogada (30 minutos) e pênaltis no empate, experiência valendo 1,5,
-- cartões contados à parte (o segundo amarelo suspende por um jogo de copa; depois das quartas os amarelos zeram) e a trava de clube:
-- quem jogou a copa da temporada por um clube não joga por outro. Lesão continua valendo para liga e copa.

alter table public.jogadores add column if not exists amarelos_copa smallint;                                       -- amarelos acumulados na copa
alter table public.jogadores add column if not exists fora_copa smallint;                                           -- jogos de copa que ainda fica suspenso
alter table public.jogadores add column if not exists copa_clube bigint references public.clubes on delete set null; -- clube pelo qual jogou a copa nesta temporada

-- Grava cartões, suspensões e a trava de clube da copa. Só a função do servidor chama. p_lista: [{ id, amarelos, fora, clube }].
create or replace function public.aplicar_copa(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set amarelos_copa = x.amarelos, fora_copa = x.fora, copa_clube = x.clube
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, amarelos int, fora int, clube bigint)
    where j.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_copa(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_copa(jsonb) to service_role;

-- A fase seguinte da copa, agora esperando os efeitos do apito final de todos os jogos e lendo o vencedor gravado pela partida
-- (prorrogação e pênaltis incluídos).
-- Pode ser chamada por qualquer um, quantas vezes for.
create or replace function public.copa_avancar(p_liga bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_copa jsonb; v_fase int; v_ids bigint[]; v_data jsonb; n int := 0; i int; a bigint; b bigint; na int; nb int;
begin
  select copa into v_copa from ligas where id = p_liga for update;
  if v_copa is null then return 0; end if;
  select max(copa_fase) into v_fase from partidas where liga_id = p_liga and fase = 'copa';
  if v_fase is null or v_fase >= 6 then return 0; end if;
  if exists (select 1 from partidas where liga_id = p_liga and fase = 'copa' and copa_fase = v_fase and (not processada or fim > now())) then return 0; end if;
  if exists (select 1 from partidas p left join resultados r on r.partida_id = p.id
             where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase and (r.partida_id is null or r.efeitos is not null)) then return 0; end if;
  v_data := v_copa->'datas'->v_fase; -- índice começa em zero: a posição v_fase é a da fase seguinte
  if v_data is null then return 0; end if;
  select array_agg(x.id order by random()) into v_ids from (
    select coalesce(p.vencedor, nullif(r.relatorio->>'vencedor', '')::bigint, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id
      from partidas p join resultados r on r.partida_id = p.id
      where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase
    union all
    select (e.value)::bigint from jsonb_array_elements_text(v_copa->'diretos') e where v_fase = 1
  ) x;
  if v_ids is null or array_length(v_ids, 1) < 2 then return 0; end if;
  i := 1;
  while i + 1 <= array_length(v_ids, 1) loop
    a := v_ids[i]; b := v_ids[i + 1];
    select estadio_nivel into na from clubes where id = a;
    select estadio_nivel into nb from clubes where id = b;
    if coalesce(nb, 1) > coalesce(na, 1) then a := v_ids[i + 1]; b := v_ids[i]; end if; -- joga no estádio maior; iguais, vale a ordem do sorteio
    insert into partidas (liga_id, grupo, rodada, fase, copa_fase, casa, fora, inicio, fim)
      values (p_liga, 'COPA', 100 + v_fase + 1, 'copa', v_fase + 1, a, b, (v_data->>'inicio')::timestamptz, (v_data->>'fim')::timestamptz);
    n := n + 1; i := i + 2;
  end loop;
  return n;
end $$;
revoke execute on function public.copa_avancar(bigint) from public, anon;
grant execute on function public.copa_avancar(bigint) to authenticated, service_role;

-- a virada também zera os cartões da copa e a trava de clube
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_texto text;
begin
  perform set_config('trem.virada', '1', true);
  v_texto := virar_temporada(p_liga, p_plano);
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null, copa = null where id = p_liga;
  update jogadores set amarelos_copa = null, fora_copa = null, copa_clube = null
    where (clube_id in (select id from clubes where liga_id = p_liga) or livre_liga = p_liga)
      and (amarelos_copa is not null or fora_copa is not null or copa_clube is not null);
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;
