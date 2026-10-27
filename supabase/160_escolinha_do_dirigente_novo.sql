-- Trem Soccer · quem entra depois do reinício também ganha a escolinha (27/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, publicar o site (admin.html).
-- Precisa do 123, do 151 e do 155. Pode ser executado mais de uma vez. Não exige republicar função.
--
-- Na aprovação do pedido (decidir_pedido), o admin.html passa a mandar junto com o elenco os 11 juvenis da escolinha e os 2 juvenis
-- comuns do reinício (src/base.js, juvenisDoReinicio). O insert de jogadores passa a gravar juvenil, escolinha e o formador
-- do juvenil comum (o próprio clube), como o reiniciar_liga do 155 (remendo no texto da versão no ar, como no 151).

do $$
declare d text; antigo text;
begin
  if to_regprocedure('public.decidir_pedido(bigint, boolean, text, bigint, jsonb)') is null then raise exception 'Rode antes o 123.'; end if;
  d := pg_get_functiondef('public.decidir_pedido(bigint, boolean, text, bigint, jsonb)'::regprocedure);
  if d like '%escolinha%' then return; end if;
  antigo := d;
  d := replace(d, 'salario_mercado, contrato_ate, protegido_ate)', 'salario_mercado, contrato_ate, protegido_ate, juvenil, escolinha, formador)');
  d := replace(d, '(r.v->>''protegido_ate'')::int)', '(r.v->>''protegido_ate'')::int, coalesce((r.v->>''juvenil'')::boolean, false), coalesce((r.v->>''escolinha'')::boolean, false),
        case when coalesce((r.v->>''juvenil'')::boolean, false) and not coalesce((r.v->>''escolinha'')::boolean, false) then v_c.id end)');
  if (length(d) - length(replace(d, 'escolinha', ''))) / length('escolinha') <> 3 then
    raise exception 'decidir_pedido: o insert de jogadores não está no formato esperado; nada foi trocado.';
  end if;
  execute d;
end $$;

-- conferência: true
select pg_get_functiondef('public.decidir_pedido(bigint, boolean, text, bigint, jsonb)'::regprocedure) like '%escolinha%' as remendado;
