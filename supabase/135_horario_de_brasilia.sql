-- 135: horário de Brasília escrito nas mensagens do banco (19/10/2026). Quem joga de outro fuso (um dirigente mora em Miami) via
-- "O leilão termina em 19/10 21:30" sem saber que é a hora de Brasília; as telas já mostram tudo no horário do aparelho.
-- Muda só o texto de três funções: fim do leilão depois de um lance (dar_lance_livre, do 130), oferta à liga (oferecer_a_liga, do 21)
-- e o aviso do prazo de repatriação (repatriacao_exclusiva, do 123). A regra "nenhum leilão termina entre 23h e 6h59" continua igual.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 130 e do 123 já executados. Não precisa republicar a função "rodada".

do $$
declare f text; d text;
begin
  foreach f in array array['public.dar_lance_livre(bigint, integer, integer)', 'public.oferecer_a_liga(bigint)', 'public.repatriacao_exclusiva()'] loop
    if to_regprocedure(f) is null then continue; end if;
    d := pg_get_functiondef(f::regprocedure);
    if position('horário de Brasília' in d) = 0 then
      execute replace(d, '''America/Sao_Paulo'', ''DD/MM HH24:MI'')', '''America/Sao_Paulo'', ''DD/MM HH24:MI'') || '' (horário de Brasília)''');
    end if;
  end loop;
end $$;
