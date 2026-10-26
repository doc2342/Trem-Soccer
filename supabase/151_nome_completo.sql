-- Trem Soccer · nomes de camisa: jogadores.nome é o nome de camisa (listas, campo, narração) e jogadores.nome_completo só aparece na ficha.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Pode ser executado mais de uma vez.
-- Precisa do 149. Depois: republicar as funções rodada e mercado e publicar o site (o dados/nomes.json novo vai junto).
--
-- As funções em uso que gravam jogador gerado passam a gravar também o nome_completo que vem na lista (remendo no texto da versão no ar):
-- receber_jovens (peneira), virar_temporada (base e safra da virada), comprar_pela_multa (reposição do clube sem dono),
-- decidir_pedido (dirigente novo) e aprovar_pedido_extra (clube extra). O reiniciar_liga já grava desde o 149.

alter table public.jogadores add column if not exists nome_completo text;

do $$
declare p record; d text; antigo text;
begin
  for p in select f.oid, f.proname from pg_proc f join pg_namespace s on s.oid = f.pronamespace
            where s.nspname = 'public' and f.proname in ('receber_jovens', 'virar_temporada', 'comprar_pela_multa', 'decidir_pedido', 'aprovar_pedido_extra') loop
    d := pg_get_functiondef(p.oid);
    if d like '%nome_completo%' then continue; end if;
    antigo := d;
    d := replace(d, 'insert into jogadores (clube_id, nome, pais,', 'insert into jogadores (clube_id, nome, nome_completo, pais,');
    d := replace(d, 'r.v->>''nome'', coalesce(r.v->>''pais''', 'r.v->>''nome'', r.v->>''nome_completo'', coalesce(r.v->>''pais''');
    d := replace(d, 'p_reposicao->>''nome'', coalesce(p_reposicao->>''pais''', 'p_reposicao->>''nome'', p_reposicao->>''nome_completo'', coalesce(p_reposicao->>''pais''');
    if d = antigo or (length(d) - length(replace(d, 'nome_completo', ''))) / length('nome_completo') <> 2 * (length(antigo) - length(replace(antigo, 'insert into jogadores (', ''))) / length('insert into jogadores (') then
      raise exception '%: o insert de jogadores não está no formato esperado; nada foi trocado.', p.proname;
    end if;
    execute d;
  end loop;
end $$;

-- conferência: tudo true
select p.proname, pg_get_functiondef(p.oid) like '%nome_completo%' as remendado
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('receber_jovens', 'virar_temporada', 'comprar_pela_multa', 'decidir_pedido', 'aprovar_pedido_extra', 'reiniciar_liga');
