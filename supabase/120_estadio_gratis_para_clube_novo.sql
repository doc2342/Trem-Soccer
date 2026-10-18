-- Trem Soccer · todo clube que ganha dirigente novo recebe a troca grátis de modelo e de cidade do estádio (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 119. Pode ser executado mais de uma vez. Não exige republicar função.
--
-- Um gatilho na troca de dono cobre todos os caminhos (assumir_clube, pedido aprovado, escolher clube do pedido, clube extra):
-- quando o dono muda para alguém, o estádio ganha reforma_gratis (troca de modelo na hora) e a troca de cidade volta a valer.

create or replace function public.estadio_gratis_para_dono_novo() returns trigger
language plpgsql as $$
begin
  new.estadio_visual := (coalesce(new.estadio_visual, '{}'::jsonb) - 'cidade_trocada') || '{"reforma_gratis": true, "reforma_gratis_dada": true}';
  return new;
end $$;
drop trigger if exists estadio_gratis_para_dono_novo on public.clubes;
create trigger estadio_gratis_para_dono_novo before update of dono on public.clubes
  for each row when (new.dono is not null and new.dono is distinct from old.dono)
  execute function public.estadio_gratis_para_dono_novo();
