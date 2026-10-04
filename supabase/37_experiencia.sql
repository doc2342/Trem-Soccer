-- Trem Soccer · fase 2: experiência dos jogadores.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 30_forma_e_moral.sql já executado. Depois, republicar a função "rodada". Pode ser executado mais de uma vez.
--
-- Experiência vai de 0 a 100. Sobe 1 a cada partida oficial com pelo menos 45 minutos em campo (0,5 para quem só entrou).
-- Não muda a nota do jogador: deixa o desempenho mais estável. Em cada partida todo jogador tem um "dia", sorteado em torno do
-- normal; o inexperiente varia até uns 10% para cima ou para baixo, o experiente quase nada.
-- Coluna vazia: vale a estimativa pela idade (8 pontos por ano acima dos 17), e passa a ser gravada na primeira partida.

alter table public.jogadores add column if not exists exp numeric(4,1);

-- Grava forma, moral e experiência depois da partida. Só a função do servidor chama.
create or replace function public.aplicar_momento(p_lista jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update jogadores j set forma = greatest(0, least(100, x.forma)), moral = greatest(0, least(100, x.moral)),
      exp = coalesce(greatest(0, least(100, x.exp)), j.exp)
    from jsonb_to_recordset(coalesce(p_lista, '[]'::jsonb)) as x(id bigint, forma int, moral int, exp numeric)
    where j.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.aplicar_momento(jsonb) from public, anon, authenticated;
grant execute on function public.aplicar_momento(jsonb) to service_role;
