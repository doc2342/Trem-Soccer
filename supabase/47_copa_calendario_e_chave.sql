-- Trem Soccer · Copa do Brasil, parte 1 (C1): calendário e chaveamento.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 46_janelas_aposentadoria_e_pre_acordo.sql já executado. Depois, republicar a função "rodada" (é ela que faz a copa avançar)
-- e só então gerar o calendário da temporada. Pode ser executado mais de uma vez.
--
-- A copa é um mata-mata em jogo único com os 50 clubes: preliminar com os 36 de pior campanha na temporada anterior, e os outros 14
-- entram direto na fase de 32. Fases: 1 preliminar, 2 trinta e dois, 3 oitavas, 4 quartas, 5 semifinal, 6 final.
-- O sorteio de cada fase é livre. O jogo é no estádio de maior capacidade entre os dois (capacidades iguais: sorteio).
-- As partidas ficam na tabela de partidas, com fase 'copa', grupo 'COPA' e rodada 100 + número da fase.
-- A página do administrador cria a preliminar junto com o calendário e guarda em ligas.copa as datas das seis fases e os 14 que entram direto.
-- (Campo neutro, prorrogação, pênaltis, cartões próprios, prêmios e telas vêm nas partes 2 e 3. Até lá, empate dá a vaga ao clube da casa.)

alter table public.partidas add column if not exists copa_fase smallint;                                         -- 1 a 6, só nas partidas de copa
alter table public.partidas add column if not exists vencedor bigint references public.clubes on delete set null; -- quem passou (preenchido pela parte 2)
alter table public.ligas add column if not exists copa jsonb;  -- { "datas": [{ "inicio", "fim" } x 6], "diretos": [14 ids] }

-- Cria a fase seguinte quando a atual terminou (todas as partidas calculadas e com a transmissão encerrada).
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
             where p.liga_id = p_liga and p.fase = 'copa' and p.copa_fase = v_fase and r.partida_id is null) then return 0; end if;
  v_data := v_copa->'datas'->v_fase; -- índice começa em zero: a posição v_fase é a da fase seguinte
  if v_data is null then return 0; end if;
  -- quem passou: o vencedor gravado pela partida; sem ele, quem fez mais gols (empate: o clube da casa, até a parte 2 entrar)
  select array_agg(x.id order by random()) into v_ids from (
    select coalesce(p.vencedor, case when r.gols_fora > r.gols_casa then p.fora else p.casa end) as id
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

-- a virada também apaga os dados da copa que acabou
create or replace function public.virar_temporada_com_guardas(p_liga bigint, p_plano jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_texto text;
begin
  perform set_config('trem.virada', '1', true);
  v_texto := virar_temporada(p_liga, p_plano);
  update ligas set janela_inicio_fecha = null, janela_meio_abre = null, janela_meio_fecha = null, copa = null where id = p_liga;
  perform set_config('trem.virada', '', true);
  return v_texto;
end $$;
revoke execute on function public.virar_temporada_com_guardas(bigint, jsonb) from public, anon;
grant execute on function public.virar_temporada_com_guardas(bigint, jsonb) to authenticated;
