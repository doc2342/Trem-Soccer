-- Trem Soccer · papéis dos jogadores: trocar de papel custa entrosamento (plano dos papéis, etapa 2, aprovado em 29/10).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 86_entrosamento.sql. Depois: REPUBLICAR a função "rodada".
--
-- Cada jogador guarda o papel em que jogou a última partida oficial (papel_jogado). Quem é escalado num papel diferente volta a entrosar
-- por alguns jogos (p_jogos, CONFIG.papeis.entrosarTroca no motor), como quem chega ao clube; quem repete o papel não muda.
-- Antes da temporada 1 a função rodada não manda papel nenhum, então nada muda na temporada 0.

alter table public.jogadores add column if not exists papel_jogado text; -- papel da última partida oficial (src/papeis.js), null se nunca jogou com papel

-- chamada pela função "rodada" depois de entrosar_partida: p_papeis = [{ id, papel }] dos titulares que jogaram em posição com papéis
create or replace function public.marcar_papeis(p_partida bigint, p_papeis jsonb, p_jogos integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.eh_admin()) then raise exception 'Sem permissão.'; end if;
  update jogadores j set
      entrosar = case when j.papel_jogado is not null and j.papel_jogado <> x.papel then greatest(j.entrosar, p_jogos) else j.entrosar end,
      papel_jogado = x.papel
    from jsonb_to_recordset(p_papeis) as x(id bigint, papel text)
    where j.id = x.id and x.papel is not null
      and j.clube_id in (select unnest(array[casa, fora]) from partidas where id = p_partida);
end $$;
revoke execute on function public.marcar_papeis(bigint, jsonb, integer) from public, anon;
grant execute on function public.marcar_papeis(bigint, jsonb, integer) to authenticated, service_role;
