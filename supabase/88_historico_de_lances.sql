-- Trem Soccer · histórico dos lances nos leilões de jogadores livres.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Não exige republicar função.
-- Pode ser executado mais de uma vez. Precisa do 25_regras_do_leilao.sql.
--
-- Os lances (ofertas_livres) são apagados quando o leilão fecha, e o dirigente ficava sem saber se ganhou ou perdeu.
-- Aqui cada lance dado (ou coberto) é copiado para historico_lances, que não se apaga com o leilão. A tela (Clube, Transferências)
-- cruza com a tabela transferencias para dizer quem levou. Leitura aberta, como a das próprias ofertas_livres.

create table if not exists public.historico_lances (
  jogador_id bigint not null references public.jogadores on delete cascade,
  clube_id bigint not null references public.clubes on delete cascade,
  salario int not null,
  temporadas int not null,
  criada_em timestamptz not null default now(),
  primary key (jogador_id, clube_id, criada_em)
);
create index if not exists historico_lances_clube on public.historico_lances (clube_id, criada_em desc);
alter table public.historico_lances enable row level security;
drop policy if exists historico_lances_ler on public.historico_lances;
create policy historico_lances_ler on public.historico_lances for select to anon, authenticated using (true);

-- um registro por leilão e clube: cobrir o próprio lance atualiza o registro do mesmo leilão (o aberto mais recente)
create or replace function public.copiar_lance_livre() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- o registro mais recente do clube por este jogador, se o jogador não trocou de clube depois dele (senão é outro leilão)
  update historico_lances h set salario = new.salario, temporadas = new.temporadas
   where h.jogador_id = new.jogador_id and h.clube_id = new.clube_id
     and h.criada_em = (select max(criada_em) from historico_lances where jogador_id = new.jogador_id and clube_id = new.clube_id)
     and not exists (select 1 from transferencias t where t.jogador_id = new.jogador_id and t.criada_em > h.criada_em);
  if not found then
    insert into historico_lances (jogador_id, clube_id, salario, temporadas) values (new.jogador_id, new.clube_id, new.salario, new.temporadas);
  end if;
  return new;
end $$;
drop trigger if exists copiar_lance_livre on public.ofertas_livres;
create trigger copiar_lance_livre after insert or update on public.ofertas_livres for each row execute function public.copiar_lance_livre();

-- os lances abertos agora entram no histórico já
insert into historico_lances (jogador_id, clube_id, salario, temporadas, criada_em)
select jogador_id, clube_id, salario, temporadas, criada_em from ofertas_livres on conflict do nothing;
