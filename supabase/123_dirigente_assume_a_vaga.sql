-- Trem Soccer · o dirigente novo assume a VAGA do bot (grupo e divisão), não o bot (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, recarregar o admin.html.
-- Precisa do 111 e do 113. Pode ser executado mais de uma vez. Não exige republicar função.
--
-- Na aprovação do pedido (decidir_pedido):
-- - o elenco do bot é apagado e entra o elenco novo gerado no admin.html (nível da divisão, contratos de 1 a 2 temporadas);
--   - quem foi formado na base de outro clube com dirigente vai para os jogadores livres, e por 48 h só o formador dá lance (repatriar);
--   - quem estava emprestado ao bot volta ao dono; quem o bot emprestou fica de vez onde está;
--   - quem tem proposta ou pré-contrato com dirigente fica até o negócio sair (como no clube extra, 95);
-- - estádio e estruturas no nível 1, torcida da divisão, caixa de 5.000 (o mesmo do começo da liga);
-- - tática, base, obras, comissão, extrato, olheiro e confiança do bot são apagados;
-- - o histórico do bot fica no banco com o nome, a sigla e o escudo dele (historico.nome/sigla/escudo) e as telas
--   mostram essas temporadas com o nome antigo, fora da sala de troféus do dirigente.
-- Os pontos da temporada em andamento ficam com a vaga (a classificação sai das partidas).

alter table public.historico add column if not exists nome text;   -- preenchido: temporada de um bot que deu lugar a um dirigente
alter table public.historico add column if not exists sigla text;
alter table public.historico add column if not exists escudo jsonb;
alter table public.jogadores add column if not exists repatriar_clube bigint references public.clubes on delete set null;
alter table public.jogadores add column if not exists repatriar_ate timestamptz;

-- lance em livre reservado ao formador
create or replace function public.repatriacao_exclusiva() returns trigger language plpgsql set search_path = public as $$
declare v_j jogadores%rowtype;
begin
  select * into v_j from jogadores where id = new.jogador_id;
  if v_j.repatriar_ate > now() and v_j.repatriar_clube is distinct from new.clube_id then
    raise exception 'Até % só o clube que formou o jogador pode dar lance: é o prazo para repatriar.',
      to_char(v_j.repatriar_ate at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
  end if;
  return new;
end $$;
drop trigger if exists repatriacao_exclusiva on public.ofertas_livres;
create trigger repatriacao_exclusiva before insert or update on public.ofertas_livres for each row execute function public.repatriacao_exclusiva();

-- a página do clube lê os troféus por aqui (107): leva o nome antigo junto
do $$
declare d text;
begin
  if to_regprocedure('public.carga_do_clube(bigint, bigint)') is null then return; end if;
  d := pg_get_functiondef('public.carga_do_clube(bigint, bigint)'::regprocedure);
  if position('lib, nome, sigla, escudo from historico' in d) = 0 then
    execute replace(d, 'copa, supercopa, lib from historico', 'copa, supercopa, lib, nome, sigla, escudo from historico');
  end if;
end $$;

-- p_elenco: [{nome, pais, idade, pos, fam, at, pe, principal, tal, salario, salario_mercado, contrato_ate, protegido_ate}] gerado no admin.html
drop function if exists public.decidir_pedido(bigint, boolean, text, bigint);
create or replace function public.decidir_pedido(p_id bigint, p_aprovar boolean, p_motivo text default null, p_clube bigint default null, p_elenco jsonb default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_p pedidos%rowtype;
  v_c clubes%rowtype;
  v_id bigint; r record; t text; v_fica bigint[];
begin
  if not public.eh_admin() then raise exception 'Só o administrador decide pedidos.'; end if;
  select * into v_p from pedidos where id = p_id for update;
  if v_p.id is null then raise exception 'Pedido não encontrado.'; end if;
  if v_p.estado <> 'pendente' then raise exception 'Esse pedido já foi decidido.'; end if;
  if not p_aprovar then
    update pedidos set estado = 'recusado', motivo = nullif(btrim(coalesce(p_motivo, '')), ''), decidido_em = now() where id = p_id;
    return null;
  end if;
  if jsonb_array_length(coalesce(p_elenco, '[]'::jsonb)) < 16 then raise exception 'Elenco novo incompleto: recarregue a página do administrador.'; end if;
  if exists (select 1 from clubes where dono = v_p.user_id) then raise exception 'Essa pessoa já tem um clube.'; end if;
  select * into v_c from clubes where dono is null and pais = 'Brasil' and grupo <> 'X' and liga_id = (select max(id) from ligas)
    and (p_clube is null or id = p_clube)
    order by divisao, grupo, random() limit 1 for update skip locked;
  if v_c.id is null then raise exception '%', case when p_clube is null then 'Não há vagas na liga no momento.' else 'Esse clube não está mais livre.' end; end if;
  if exists (select 1 from clubes where liga_id = v_c.liga_id and lower(nome) = lower(v_p.nome) and id <> v_c.id) then raise exception 'Já existe um clube com esse nome. Recuse o pedido e peça outro nome.'; end if;

  -- o histórico fica com o bot
  update historico set nome = v_c.nome, sigla = v_c.sigla, escudo = v_c.escudo where clube_id = v_c.id and nome is null;

  -- jogadores: emprestados voltam ou ficam, formados por dirigente vão aos livres, o resto some
  update jogadores set clube_id = emprestado_de, emprestado_de = null where clube_id = v_c.id and emprestado_de is not null;
  update jogadores set emprestado_de = null where emprestado_de = v_c.id;
  v_fica := array(select j.id from jogadores j where j.clube_id = v_c.id and (
      exists (select 1 from propostas p join clubes c on c.id = p.comprador where p.jogador_id = j.id and c.dono is not null and p.estado in ('pendente', 'contra', 'aceita'))
      or exists (select 1 from pre_contratos pc join clubes c on c.id = pc.clube_id where pc.jogador_id = j.id and c.dono is not null)));
  update jogadores j set clube_id = null, livre_liga = v_c.liga_id, livre_ate = null, livre_inicio = null, livre_abriu = null, salario = null,
      contrato_ate = null, protegido = false, protegido_ate = null, principal = false, chegou_temporada = null, chegou_janela = null,
      a_venda = false, preco_pedido = null, listado_em = null, oferta_liga_ate = null, nao_renovar = false, juvenil = false,
      repatriar_clube = j.formador, repatriar_ate = now() + interval '48 hours'
    where j.clube_id = v_c.id and j.id <> all(v_fica)
      and j.formador in (select id from clubes where dono is not null and id <> v_c.id);
  delete from jogadores where clube_id = v_c.id and id <> all(v_fica);

  foreach t in array array['taticas', 'taticas_base', 'obras', 'treinadores', 'lancamentos', 'relatorios', 'confianca_historico', 'revelados', 'escalacoes'] loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I where clube_id = $1', t) using v_c.id; end if;
  end loop;

  for r in select value as v from jsonb_array_elements(p_elenco) loop
    insert into jogadores (clube_id, nome, pais, idade, pos, fam, at, pe, principal, salario, salario_mercado, contrato_ate, protegido_ate)
      values (v_c.id, r.v->>'nome', coalesce(r.v->>'pais', 'Brasil'), (r.v->>'idade')::smallint, r.v->>'pos', r.v->'fam',
        array(select jsonb_array_elements_text(r.v->'at')::smallint), r.v->>'pe', coalesce((r.v->>'principal')::boolean, false),
        (r.v->>'salario')::int, (r.v->>'salario_mercado')::int, (r.v->>'contrato_ate')::int, (r.v->>'protegido_ate')::int)
      returning id into v_id;
    insert into jogadores_ocultos (jogador_id, tal) values (v_id, (r.v->>'tal')::smallint);
  end loop;

  update clubes c set dono = v_p.user_id, nome = v_p.nome, sigla = v_p.sigla, escudo = v_p.escudo, uniforme = v_p.uniforme,
      assumido_em = now(), ultimo_acesso = now(), confianca = 50, segundo_clube = false, multas_extra = 0, multas_extra_temporada = null,
      estadio_nivel = 1, ct_nivel = 1, medico_nivel = 1, fisio_nivel = 1, base_nivel = 1, estadio_visual = null,
      torcida = coalesce((select d.torcida_base from divisoes d where d.liga_id = c.liga_id and d.divisao = c.divisao), 14000),
      humor = 8, torcida_fator = 1, torcida_fator_temporada = null, carne = 0, carne_temporada = null, vermelho_rodadas = 0,
      premio_antecipado = 0, antecipou_temporada = null, candidatos_em = null, peneira_temporada = null, escudo_troca = false, paraquedas = null
    where c.id = v_c.id;
  insert into financas (clube_id, caixa) values (v_c.id, 5000) on conflict (clube_id) do update set caixa = 5000;

  update pedidos set estado = 'aprovado', decidido_em = now() where id = p_id;
  return v_c.id;
end $$;
revoke execute on function public.decidir_pedido(bigint, boolean, text, bigint, jsonb) from public, anon;
grant execute on function public.decidir_pedido(bigint, boolean, text, bigint, jsonb) to authenticated;
