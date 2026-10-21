-- Trem Soccer · número da camisa escolhido pelo dirigente.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Depois, publicar de novo a função "rodada" (supabase/functions/rodada/index.ts, já refeita pelo empacotador): é ela que leva o número para o jogo.
--
-- jogadores.numero: de 1 a 99, ou vazio (o jogo dá um número pela posição, sem pegar os escolhidos). Não repete dentro do clube.
-- Quem muda de clube (venda, empréstimo, volta de empréstimo) perde o número.

alter table public.jogadores add column if not exists numero smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'jogadores_numero_faixa') then
    alter table public.jogadores add constraint jogadores_numero_faixa check (numero between 1 and 99);
  end if;
  -- adiável: trocar dois números de lugar numa gravação só não esbarra no "repetido" no meio do caminho
  if not exists (select 1 from pg_constraint where conname = 'jogadores_numero_unico') then
    alter table public.jogadores add constraint jogadores_numero_unico unique (clube_id, numero) deferrable initially deferred;
  end if;
end $$;

create or replace function public.limpar_numero_na_troca() returns trigger
language plpgsql as $$
begin
  if new.clube_id is distinct from old.clube_id then new.numero := null; end if;
  return new;
end $$;
drop trigger if exists jogadores_numero_na_troca on public.jogadores;
create trigger jogadores_numero_na_troca before update of clube_id on public.jogadores
  for each row execute function public.limpar_numero_na_troca();

-- Grava os números do elenco. p_numeros: { "id do jogador": número ou null }; só mexe em jogadores do clube do dirigente.
create or replace function public.definir_numeros(p_clube bigint, p_numeros jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_ruim text;
begin
  if not exists (select 1 from clubes where id = p_clube and dono = auth.uid()) then raise exception 'Este clube não é seu.'; end if;
  if jsonb_typeof(p_numeros) <> 'object' then raise exception 'Números inválidos.'; end if;
  select k into v_ruim from jsonb_each(p_numeros) e(k, v)
    where jsonb_typeof(v) not in ('null', 'number') or (jsonb_typeof(v) = 'number' and (v::text !~ '^[0-9]+$' or v::int not between 1 and 99)) limit 1;
  if v_ruim is not null then raise exception 'Use números de 1 a 99.'; end if;
  update jogadores j set numero = case when jsonb_typeof(p_numeros -> (j.id::text)) = 'number' then (p_numeros ->> (j.id::text))::smallint end
    where j.clube_id = p_clube and p_numeros ? (j.id::text);
  select numero::text into v_ruim from jogadores where clube_id = p_clube and numero is not null group by numero having count(*) > 1 limit 1;
  if v_ruim is not null then raise exception 'O % está em dois jogadores.', v_ruim; end if;
end $$;
revoke execute on function public.definir_numeros(bigint, jsonb) from public, anon;
grant execute on function public.definir_numeros(bigint, jsonb) to authenticated;
