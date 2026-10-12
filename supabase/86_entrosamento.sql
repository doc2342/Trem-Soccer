-- Trem Soccer · entrosamento das novas contratações.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 76_emprestimo_e_supercopa.sql. Exige REPUBLICAR a função "rodada". Pode ser executado mais de uma vez.
--
-- Quem chega a um clube (compra, multa, leilão de livre, empréstimo) fica 8 jogos do clube "entrosando". Enquanto isso, o setor em que
-- ele é escalado (defesa, meio ou ataque) rende menos: até 10% a menos se o setor inteiro for de recém-chegados (motor.js, CONFIG.entrosamento).
-- Não conta como chegada: juvenil promovido, jogador gerado para repor elenco e a volta de um empréstimo.
-- Quem já está nos clubes hoje fica entrosado (a coluna nasce em 0).

alter table public.jogadores add column if not exists entrosar smallint not null default 0; -- jogos do clube que faltam para o jogador estar entrosado

create or replace function public.chegada_ao_clube() returns trigger language plpgsql as $$
begin
  if new.clube_id is not null and new.clube_id is distinct from old.clube_id and new.clube_id is distinct from old.emprestado_de then new.entrosar := 8; end if;
  return new;
end $$;
drop trigger if exists chegada_ao_clube on public.jogadores;
create trigger chegada_ao_clube before update of clube_id on public.jogadores for each row execute function public.chegada_ao_clube();

-- chamada pela função "rodada" logo depois de calcular cada partida oficial: um jogo a menos para os recém-chegados dos dois clubes
create or replace function public.entrosar_partida(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or public.eh_admin()) then raise exception 'Sem permissão.'; end if;
  update jogadores set entrosar = entrosar - 1
    where entrosar > 0 and clube_id in (select unnest(array[casa, fora]) from partidas where id = p_partida);
end $$;
revoke execute on function public.entrosar_partida(bigint) from public, anon;
grant execute on function public.entrosar_partida(bigint) to authenticated, service_role;
