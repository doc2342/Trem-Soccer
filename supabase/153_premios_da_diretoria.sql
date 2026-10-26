-- Trem Soccer · prêmios da diretoria por faixa de confiança (decididos em 25/10/2026). Cada faixa leva também a de baixo:
--   70+: verba de 5% do teto da folha (como antes);
--   85+: verba de 10% + 1 vaga a mais na lista de protegidos (8) na temporada seguinte;
--   95+: o de 85 + 1 compra pela multa a mais (antes vinha com 85) + 1 garoto a mais na peneira.
-- O direito a clube extra deixa de ser prêmio (a coluna segundo_clube e o pedido de clube extra continuam no banco, sem uso).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 91/93 (diretoria) e do 41 (protegidos) já executados. Depois, republicar a função "mercado" (peneira) e publicar o site.
--
-- 1. premio_da_diretoria(clube, temporada): a faixa (0, 70, 85 ou 95) que vale na temporada, pela confiança com que o clube terminou a anterior
--    (confianca_historico.depois). Zera sozinho no reinício e na troca de dono, que apagam esse histórico.
-- 2. aplicar_confianca: a compra extra só com 95+; sai o direito a clube extra; quem perde a vaga a mais dos protegidos tem a lista cortada
--    no limite novo, saindo os de menor salário (com um lançamento de aviso, sem valor).
-- 3. proteger_jogador: o limite é 7, ou 8 com o prêmio de 85+.

create or replace function public.premio_da_diretoria(p_clube bigint, p_temporada int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when depois >= 95 then 95 when depois >= 85 then 85 when depois >= 70 then 70 else 0 end
                     from confianca_historico where clube_id = p_clube and temporada = p_temporada - 1), 0)
$$;
grant execute on function public.premio_da_diretoria(bigint, int) to anon, authenticated;

create or replace function public.aplicar_confianca(p_liga bigint, p_lista jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_t int; r record; v_antes int; v_depois int; v_teto int; v_verba int; v_div int; v_n int := 0; v_total int := 0; v_fora text;
begin
  if not public.eh_admin() then raise exception 'Só o administrador aplica a confiança.'; end if;
  select temporada into v_t from ligas where id = p_liga for update;
  if exists (select 1 from confianca_historico where liga_id = p_liga and temporada = v_t) then return 'A confiança desta temporada já tinha sido aplicada.'; end if;
  for r in select * from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(clube_id bigint, delta int, detalhes jsonb) loop
    select confianca, divisao into v_antes, v_div from clubes where id = r.clube_id and liga_id = p_liga for update;
    if v_antes is null then continue; end if;
    v_depois := greatest(0, least(100, v_antes + greatest(-20, least(20, r.delta))));
    v_teto := coalesce((select teto_folha from divisoes where liga_id = p_liga and divisao = v_div), 14000);
    v_verba := case when v_depois >= 85 then round(v_teto * 0.10) when v_depois >= 70 then round(v_teto * 0.05) else 0 end;
    update clubes set confianca = v_depois,
        multas_extra = case when v_depois >= 95 then 1 else 0 end, multas_extra_temporada = v_t + 1
      where id = r.clube_id;
    if v_verba > 0 then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values (r.clube_id, v_t, null, 'diretoria', v_verba, 'Verba da diretoria pela confiança no trabalho');
      update financas set caixa = caixa + v_verba where clube_id = r.clube_id;
      v_total := v_total + v_verba;
    end if;
    -- lista de protegidos no limite da temporada seguinte (7, ou 8 com 85+): quem passar sai, do menor salário para cima
    with fora as (
      update jogadores set protegido = false where id in (
        select id from jogadores where clube_id = r.clube_id and protegido
          order by coalesce(salario, 0) desc, id offset (7 + case when v_depois >= 85 then 1 else 0 end))
      returning nome)
    select string_agg(nome, ', ') into v_fora from fora;
    if v_fora is not null then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (r.clube_id, v_t, null, 'diretoria', 0, 'Fim da vaga a mais na lista de protegidos: ' || v_fora || ' saiu da lista');
    end if;
    insert into confianca_historico (liga_id, temporada, clube_id, antes, depois, detalhes, verba) values (p_liga, v_t, r.clube_id, v_antes, v_depois, r.detalhes, v_verba);
    v_n := v_n + 1;
  end loop;
  return format('Confiança da diretoria aplicada a %s clubes (verbas: %s mil).', v_n, v_total);
end $$;
revoke execute on function public.aplicar_confianca(bigint, jsonb) from public, anon;
grant execute on function public.aplicar_confianca(bigint, jsonb) to authenticated;

create or replace function public.proteger_jogador(p_jogador bigint, p_proteger boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_max int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  if p_proteger then
    if v_j.protegido then return; end if;
    v_max := 7 + case when public.premio_da_diretoria(v_c.id, (select temporada from ligas where id = v_c.liga_id)) >= 85 then 1 else 0 end;
    if (select count(*) from jogadores where clube_id = v_c.id and protegido) >= v_max then raise exception 'A lista de protegidos já tem % jogadores.', v_max; end if;
  else
    if janela_do_mercado(v_c.liga_id) is not null then raise exception 'Com a janela aberta, ninguém sai da lista de protegidos.'; end if;
  end if;
  update jogadores set protegido = p_proteger where id = p_jogador;
end $$;
revoke execute on function public.proteger_jogador(bigint, boolean) from public, anon;
grant execute on function public.proteger_jogador(bigint, boolean) to authenticated;
