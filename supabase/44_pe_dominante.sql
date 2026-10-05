-- Trem Soccer · pé dominante dos jogadores.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois, republicar a função "rodada" (é ela que aplica o efeito nas partidas). Pode ser executado mais de uma vez sem trocar o pé de ninguém.
--
-- pe: 'D' (direito), 'E' (esquerdo) ou 'A' (ambidestro). Só pesa em quem joga pelos lados:
--   no lado do pé bom, cruza 4% melhor; no lado trocado, lateral, ala e meia aberto cruzam 10% pior e passam 3% pior;
--   ponta e meia-atacante de pé trocado cruzam 10% pior, mas finalizam e chutam de longe 5% melhor.
-- O pé é sorteado puxando para o lado da posição: quem joga pela esquerda costuma ser canhoto.
-- No geral, perto de 70% de destros, 22% de canhotos e 8% de ambidestros.

alter table public.jogadores add column if not exists pe text;

create or replace function public.sortear_pe(p_pos text) returns text
language plpgsql volatile as $$
declare r float8 := random();
begin
  if p_pos in ('DL', 'WBL', 'ML', 'AML', 'LW') then return case when r < 0.75 then 'E' when r < 0.85 then 'A' else 'D' end; end if;
  if p_pos in ('DR', 'WBR', 'MR', 'AMR', 'RW') then return case when r < 0.88 then 'D' when r < 0.95 then 'A' else 'E' end; end if;
  return case when r < 0.72 then 'D' when r < 0.92 then 'E' else 'A' end;
end $$;

-- quem já existe e ainda não tem pé
update public.jogadores set pe = public.sortear_pe(pos) where pe is null;

-- todo jogador novo (base, peneira, reposição, virada) nasce com pé
create or replace function public.dar_pe_ao_jogador() returns trigger
language plpgsql as $$
begin
  if new.pe is null then new.pe := public.sortear_pe(new.pos); end if;
  return new;
end $$;
drop trigger if exists pe_do_jogador on public.jogadores;
create trigger pe_do_jogador before insert on public.jogadores for each row execute function public.dar_pe_ao_jogador();
