-- Trem Soccer · devolver ao dono um clube liberado por engano no admin (29/10/2026).
-- Como usar: no SQL Editor, colar e clicar em Run (McLaren, id 34, volta para guardizolla@gmail.com). Não exige republicar nada.
--
-- Pôr o dono de volta dispara os gatilhos de quem assume clube sem dono: caixa vira 5.000 (52), estádio ganha troca grátis (120).
-- Este bloco guarda o caixa, o vermelho e o estádio antes e devolve depois, para o clube voltar como estava.
-- O que a liberação apagou e não volta por aqui: a tática (e a da base) e o nome do dirigente; o dono refaz no jogo.
do $$
declare
  v_clube bigint := (select id from public.clubes where id = 34); -- McLaren
  v_dono uuid := (select id from auth.users where lower(email) = lower('guardizolla@gmail.com'));
  v_caixa numeric; v_vermelho int; v_estadio jsonb;
begin
  if v_clube is null then raise exception 'Clube não encontrado: confira o nome.'; end if;
  if v_dono is null then raise exception 'E-mail não encontrado entre os usuários.'; end if;
  if (select dono from public.clubes where id = v_clube) is not null then raise exception 'Esse clube já tem dono.'; end if;
  select caixa into v_caixa from public.financas where clube_id = v_clube;
  select vermelho_rodadas, estadio_visual into v_vermelho, v_estadio from public.clubes where id = v_clube;
  update public.clubes set dono = v_dono, assumido_em = now(), ultimo_acesso = now() where id = v_clube;
  update public.clubes set vermelho_rodadas = v_vermelho, estadio_visual = v_estadio where id = v_clube;
  if v_caixa is not null then update public.financas set caixa = v_caixa where clube_id = v_clube; end if;
  raise notice 'Clube % devolvido. Caixa mantido em %.', v_clube, v_caixa;
end $$;
