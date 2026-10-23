-- Trem Soccer · a carga da página do clube (107) passa a trazer também o resto da abertura do jogo.html (23/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, publicar o site.
-- Precisa do 107, do 92 e do 115. Pode ser executado mais de uma vez. Não exige republicar função.
--
-- Cada abertura da página ainda fazia três chamadas avulsas além da carga (registrar_acesso, ultima_novidade e propostas_patrocinio),
-- cada uma com o seu OPTIONS: umas 6 linhas de log por visita. Agora vêm dentro da carga:
--   acesso: true quando o último acesso do clube foi registrado;
--   novidade: a hora da última novidade (ultima_novidade), já depois de os leilões vencidos fecharem;
--   patrocinio: o mesmo que propostas_patrocinio() devolve.
-- Como no 123, a função que está no banco é editada no lugar (ela já pode ter remendos): só entra o trecho novo, antes do "return r;".
-- Sem este SQL, ou se uma parte falhar lá dentro, a página faz a chamada avulsa como antes.

do $$
declare d text;
begin
  if to_regprocedure('public.carga_do_clube(bigint, bigint)') is null then raise exception 'Rode o 107_carga_do_clube.sql antes.'; end if;
  d := pg_get_functiondef('public.carga_do_clube(bigint, bigint)'::regprocedure);
  if position('''novidade''' in d) > 0 then return; end if;
  execute replace(d, 'return r;', $t$-- 142: o resto da abertura da página (acesso, última novidade, patrocínio)
  begin perform registrar_acesso(); r := r || jsonb_build_object('acesso', true); exception when others then null; end;
  begin r := r || jsonb_build_object('novidade', ultima_novidade(p_liga, p_clube)); exception when others then null; end;
  begin r := r || jsonb_build_object('patrocinio', propostas_patrocinio()); exception when others then null; end;

  return r;$t$);
end $$;
