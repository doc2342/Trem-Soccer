-- Trem Soccer · 159: prestígio da Série B pelo destino, sem o corte da T14 (27/10/2026).
-- Depois do reinício a liga recomeçou na temporada 0, e o "temporada < 14" do 114 voltava à regra antiga (só o 1º ganhava).
-- Agora, na B, ganha +0,03 quem subiu ou foi campeão (o vencedor da final do playoff, que a virada grava como 'campeão');
-- na T0 sobem 12 donos, e todos ganham. Quem fica na B perde 0,02, como antes.
-- Como usar: SQL Editor, colar e Run. Pode rodar mais de uma vez. Rodar antes da virada da T0. Não precisa republicar função.
create or replace function public.atualizar_torcidas(p_liga bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare v_t int; n int;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select temporada into v_t from ligas where id = p_liga;
  update clubes c set torcida_fator_temporada = v_t,
      torcida_fator = least(2.15, greatest(1, c.torcida_fator
        + case h.divisao when 1 then 0.03 + case when h.posicao = 1 then 0.10 else 0 end
                         when 2 then case when h.destino in ('subiu', 'campeão') then 0.03 else -0.02 end
                         else case when h.posicao = 1 then 0 else -0.04 end end
        + case h.copa when 'campeão' then 0.08 when 'vice' then 0.03 else 0 end))
    from historico h
    where h.liga_id = p_liga and h.temporada = v_t - 1 and h.clube_id = c.id and c.torcida_fator_temporada is distinct from v_t;
  get diagnostics n = row_count;
  return n;
end $$;
