-- Trem Soccer · clube guardado (grupo X) não entra mais na escolha de destino do agente e dos caminhos automáticos (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Precisa do 114. Pode ser executado mais de uma vez.
--
-- O caso: o agente manda o jogador ao clube sem dono de MENOR elenco; os guardados, quase vazios, ganhavam sempre, e o gatilho do 114
-- barrava a mudança ("Clube guardado: fora do mercado até voltar a uma competição"), derrubando a venda.
-- Remendo: em toda função que escolhe clube sem dono com vaga (vaga_no_elenco), 'c.dono is null and' ganha 'c.grupo <> ''X'' and'.

do $$
declare r record; d text; n text; v_trocadas text := '';
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.prosrc like '%c.dono is null and%' and p.prosrc like '%vaga_no_elenco(c.id%'
              and p.prosrc not like '%c.dono is null and c.grupo <> ''X''%' loop
    d := pg_get_functiondef(r.oid);
    n := replace(d, 'c.dono is null and', 'c.dono is null and c.grupo <> ''X'' and');
    execute n;
    v_trocadas := v_trocadas || ' ' || r.proname;
  end loop;
  raise notice 'Funções sem guardados:%', coalesce(nullif(v_trocadas, ''), ' nenhuma (já trocadas)');
end $$;

-- conferência: toda função que escolhe destino com vaga deve aparecer com sem_guardado = true
select p.proname, p.prosrc like '%c.grupo <> ''X''%' as sem_guardado from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prosrc like '%vaga_no_elenco(c.id%' order by 1;
