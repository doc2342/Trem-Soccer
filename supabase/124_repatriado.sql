-- Trem Soccer · a volta do formado ao clube formador aparece como "repatriado" nas transferências (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 123. Pode ser executado mais de uma vez. Não exige republicar função.
--
-- O tipo continua 'livre' (as travas de contratação de livres contam por ele); o gatilho só marca repatriado = true quando quem
-- assina é o clube que o 123 reservou para repatriar, dentro ou fora das 48 h.

alter table public.transferencias add column if not exists repatriado boolean not null default false;

create or replace function public.marca_repatriado() returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo = 'livre' and new.para_clube is not null
     and exists (select 1 from jogadores where id = new.jogador_id and repatriar_clube = new.para_clube) then
    new.repatriado := true;
  end if;
  return new;
end $$;
drop trigger if exists marca_repatriado on public.transferencias;
create trigger marca_repatriado before insert on public.transferencias for each row execute function public.marca_repatriado();
