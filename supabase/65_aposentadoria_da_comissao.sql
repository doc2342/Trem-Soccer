-- Trem Soccer · a comissão técnica envelhece e se aposenta.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Não precisa republicar função nenhuma. Pode ser executado mais de uma vez.
--
-- A cada virada de temporada, todo profissional contratado (treinador, médico, preparadores, psicólogo, olheiro e analista) fica um ano mais velho,
-- e quem chega aos 65 anos se aposenta: sai do clube sem custo. O mural do clube avisa durante a temporada quem está com 64.
-- Os candidatos da lista não envelhecem: a lista é refeita de tempos em tempos.

create or replace function public.envelhecer_comissao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.temporada > old.temporada then
    update treinadores t set idade = t.idade + 1 where t.contratado and t.clube_id in (select id from clubes where liga_id = new.id);
    delete from treinadores t where t.contratado and t.idade >= 65 and t.clube_id in (select id from clubes where liga_id = new.id);
  end if;
  return null;
end $$;
drop trigger if exists ligas_envelhecer_comissao on public.ligas;
create trigger ligas_envelhecer_comissao after update of temporada on public.ligas for each row execute function public.envelhecer_comissao();
