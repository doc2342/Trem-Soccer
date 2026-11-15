-- 181: favoritos do mercado (pedido de um amigo do dono, 15/11).
-- Cada dirigente marca jogadores com uma estrela na busca do mercado e filtra "só favoritos".
-- A lista é do usuário, não do clube: vale no celular e no PC e continua se ele trocar de clube.
-- Ninguém vê os favoritos dos outros.
-- Precisa de nada além do 19 (jogadores). Depois: publicar o site (não mexe nas funções rodada/mercado).

create table if not exists public.favoritos (
  dono uuid not null default auth.uid() references auth.users on delete cascade,
  jogador_id bigint not null references public.jogadores on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (dono, jogador_id)
);

alter table public.favoritos enable row level security;
drop policy if exists favoritos_do_dono on public.favoritos;
create policy favoritos_do_dono on public.favoritos for all to authenticated
  using (dono = auth.uid()) with check (dono = auth.uid());
grant select, insert, delete on public.favoritos to authenticated;
