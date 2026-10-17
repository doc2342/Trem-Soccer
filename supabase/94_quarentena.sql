-- Trem Soccer · bloqueio entre clubes do mesmo dono e quarentena (passo 3 do segundo clube, desenho de 17/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 92 e do 93.
--
-- 1. jogadores.saiu_de / saiu_temporada: o último clube COM DONO de onde o jogador saiu de verdade (empréstimo que volta não conta).
-- 2. Dois clubes do mesmo dono não fazem negócio entre si, e um jogador que saiu de um clube seu na temporada T
--    não entra em outro clube seu até a virada de T+1 (por qualquer caminho: proposta, multa, livre, oferta à liga, empréstimo, pré-contrato).
--    Outros dirigentes não são afetados. Voltar ao próprio clube de onde saiu (fim de empréstimo, por exemplo) é livre.
-- 3. A trava fica no banco, em dois lugares:
--    - na mudança de clube do jogador (cobre todo caminho que move o jogador na hora);
--    - no registro de proposta, pré-contrato e lance em livre (para o aviso sair no pedido, e não na virada).
-- 4. Leilão de livre: um lance por dono (dois clubes seus não disputam o mesmo jogador).
-- Usa o dono de hoje de cada clube.

alter table public.jogadores add column if not exists saiu_de bigint references public.clubes on delete set null;
alter table public.jogadores add column if not exists saiu_temporada int;

-- por que o jogador não pode ir para p_para (null = pode): p_de é o clube de onde ele sai ou saiu, p_t a temporada da saída
create or replace function public.motivo_entre_meus(p_de bigint, p_t int, p_para bigint, p_direto boolean) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_direto then format('o %s e o %s são do mesmo dono, e clubes do mesmo dono não fazem negócio entre si', de.nome, para.nome)
    else format('ele saiu do %s, que também é seu, e só pode entrar em outro clube seu depois da virada da temporada %s', de.nome, p_t + 1)
  end
  from clubes de, clubes para
  where de.id = p_de and para.id = p_para and p_de <> p_para and para.dono is not null and de.dono = para.dono
    and (p_direto or p_t + 1 >= (select temporada from ligas where id = para.liga_id))
$$;

create or replace function public.quarentena(p_jogador bigint, p_para bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    public.motivo_entre_meus(coalesce(j.emprestado_de, j.clube_id), null, p_para, true),
    public.motivo_entre_meus(j.saiu_de, j.saiu_temporada, p_para, false))
  from jogadores j where j.id = p_jogador
$$;

create or replace function public.jogador_muda_de_clube() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_motivo text;
begin
  if new.clube_id is not distinct from old.clube_id then return new; end if;
  if new.clube_id is not null then
    v_motivo := public.motivo_entre_meus(coalesce(old.emprestado_de, old.clube_id), null, coalesce(new.emprestado_de, new.clube_id), true);
    if v_motivo is null then v_motivo := public.motivo_entre_meus(old.saiu_de, old.saiu_temporada, new.clube_id, false); end if;
    if v_motivo is not null then raise exception 'Negócio proibido: %.', v_motivo; end if;
  end if;
  -- saída de verdade de um clube com dono (quem estava emprestado e volta não "sai" do clube que só o tinha emprestado)
  if old.clube_id is not null and old.emprestado_de is null and exists (select 1 from clubes where id = old.clube_id and dono is not null) then
    new.saiu_de := old.clube_id;
    new.saiu_temporada := (select l.temporada from clubes c join ligas l on l.id = c.liga_id where c.id = old.clube_id);
  end if;
  return new;
end $$;
drop trigger if exists jogadores_muda_de_clube on public.jogadores;
create trigger jogadores_muda_de_clube before update of clube_id on public.jogadores for each row execute function public.jogador_muda_de_clube();

-- pedidos que só movem o jogador depois (proposta, pré-acordo, empréstimo, pré-contrato, lance em livre): barrados no registro
create or replace function public.pedido_entre_meus() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_para bigint; v_motivo text;
begin
  -- a mesma função serve às três tabelas: lê o campo pelo JSON, porque new.comprador não existe nas outras
  v_para := coalesce((to_jsonb(new)->>'comprador')::bigint, (to_jsonb(new)->>'clube_id')::bigint);
  v_motivo := public.quarentena(new.jogador_id, v_para);
  if v_motivo is not null then raise exception 'Negócio proibido: %.', v_motivo; end if;
  if tg_table_name = 'ofertas_livres' and exists (
      select 1 from ofertas_livres o join clubes c on c.id = o.clube_id join clubes m on m.id = v_para
       where o.jogador_id = new.jogador_id and o.clube_id <> v_para and m.dono is not null and c.dono = m.dono) then
    raise exception 'Outro clube seu já está neste leilão: clubes do mesmo dono não disputam o mesmo jogador.';
  end if;
  return new;
end $$;
drop trigger if exists propostas_entre_meus on public.propostas;
create trigger propostas_entre_meus before insert on public.propostas for each row execute function public.pedido_entre_meus();
drop trigger if exists pre_contratos_entre_meus on public.pre_contratos;
create trigger pre_contratos_entre_meus before insert on public.pre_contratos for each row execute function public.pedido_entre_meus();
drop trigger if exists ofertas_livres_entre_meus on public.ofertas_livres;
create trigger ofertas_livres_entre_meus before insert on public.ofertas_livres for each row execute function public.pedido_entre_meus();
