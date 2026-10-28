-- Trem Soccer · pé fraco (plano dos papéis, etapa "Pé fraco").
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode rodar mais de uma vez sem mudar a nota de ninguém.
-- Precisa do 44_pe_dominante.sql já executado. Depois: republicar a função "rodada" e publicar o site.
--
-- pe_fraco: nota de 1 a 20 do pé ruim, que o site mostra em palavras (Péssimo, Fraco, Razoável, Bom, Muito bom, Ambidestro).
-- Os ambidestros (pe 'A') ficam de 13 a 20; os outros, de 1 a 12. O sorteio sai do id, então o mesmo jogador tem sempre a mesma nota.
-- Só pesa nas partidas a partir da temporada 1 (PE_FRACO_DESDE em src/modelo.js); a temporada 0 joga como antes.

alter table public.jogadores add column if not exists pe_fraco smallint check (pe_fraco between 1 and 20);

create or replace function public.sortear_pe_fraco(p_id bigint, p_pe text) returns smallint
language sql immutable as $$
  select (case when p_pe = 'A' then 13 + ((hashtext('pe_fraco:' || p_id)::bigint % 8) + 8) % 8
               else 1 + ((hashtext('pe_fraco:' || p_id)::bigint % 12) + 12) % 12 end)::smallint
$$;

-- quem já existe e ainda não tem a nota
update public.jogadores set pe_fraco = public.sortear_pe_fraco(id, pe) where pe_fraco is null;

-- todo jogador novo (base, peneira, mercado, virada) nasce com pé e com a nota do pé fraco: o mesmo gatilho do 44
create or replace function public.dar_pe_ao_jogador() returns trigger
language plpgsql as $$
begin
  if new.pe is null then new.pe := public.sortear_pe(new.pos); end if;
  if new.pe_fraco is null then new.pe_fraco := public.sortear_pe_fraco(new.id, new.pe); end if;
  return new;
end $$;
drop trigger if exists pe_do_jogador on public.jogadores;
create trigger pe_do_jogador before insert on public.jogadores for each row execute function public.dar_pe_ao_jogador();
