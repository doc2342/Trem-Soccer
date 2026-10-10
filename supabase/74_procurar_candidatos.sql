-- Trem Soccer · "procurar de novo": o dirigente paga para refazer a lista de candidatos da comissão técnica antes do prazo.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 73_prazos_e_comissao.sql. Não exige republicar função. Pode ser executado mais de uma vez.
--
-- Custa 50 mil e vale 3 vezes por temporada (as buscas são contadas pelos lançamentos do tipo 'busca' no extrato).
-- A lista inteira é refeita (todas as funções), e o prazo da renovação automática recomeça a contar.

create or replace function public.procurar_candidatos() returns text
language plpgsql security definer set search_path = public as $$
declare v_c clubes%rowtype; v_temp int; v_feitas int; c_custo int := 50; c_limite int := 3;
begin
  select * into v_c from clubes where dono = auth.uid() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  select temporada into v_temp from ligas where id = v_c.liga_id;
  select count(*) into v_feitas from lancamentos where clube_id = v_c.id and temporada = v_temp and tipo = 'busca';
  if v_feitas >= c_limite then raise exception 'Você já procurou % vezes nesta temporada: agora, só quando a lista se renovar sozinha.', c_limite; end if;
  if coalesce((select caixa from financas where clube_id = v_c.id), 0) < c_custo then raise exception 'Caixa insuficiente: a busca custa % mil.', c_custo; end if;
  update financas set caixa = caixa - c_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_temp, null, 'busca', -c_custo, 'Busca de candidatos para a comissão (' || v_feitas + 1 || ' de ' || c_limite || ')');
  update clubes set candidatos_em = null where id = v_c.id; -- candidatos_a_treinador refaz a lista na próxima chamada
  return 'Lista nova a caminho. Restam ' || c_limite - v_feitas - 1 || ' buscas nesta temporada.';
end $$;
revoke execute on function public.procurar_candidatos() from public, anon;
grant execute on function public.procurar_candidatos() to authenticated;
