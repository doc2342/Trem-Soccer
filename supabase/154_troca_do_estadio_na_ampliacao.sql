-- Trem Soccer · troca de arquitetura e cidade do estádio só junto com uma ampliação (decidido em 26/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 123 e do 129. Pode ser executado mais de uma vez. Rodar no reinício (roteiro da virada). Não exige republicar função.
--
-- iniciar_obra('estadio', modelo, cidade): ampliar mudando o modelo, a cidade ou os dois custa a ampliação +50% (uma taxa só);
--   a primeira ampliação (nível alvo 2) é livre. Escolher o modelo ou a cidade que já tem não conta como mudança.
--   A escolha fica em estadio_visual.modelo_alvo/cidade_alvo e vale quando a obra termina (gatilho abaixo; a rodada conclui com
--   "update obras set concluida = true", então não muda nada nela).
-- reformar_estadio(modelo, cidade): a troca grátis de estádio novo (reforma_gratis_para, do 127/128) continua grátis e na hora,
--   em qualquer nível. Fora isso, só no nível 8 (onde não há mais ampliação): obra de 15 mi e 18 rodadas.
-- Saem: reforma_gratis (geral), cidade_trocada, a troca de cidade em salvar_estadio_visual e o gatilho do 120.
-- gratis_para_lista e liberar_troca_gratis são as do 128 de novo: no banco ao vivo o 128 não tinha entrado inteiro.

-- ---------- troca grátis de estádio novo (o mesmo do 128) ----------
create or replace function public.gratis_para_lista(v jsonb) returns jsonb language sql immutable as $$
  select case jsonb_typeof(v->'reforma_gratis_para') when 'array' then v->'reforma_gratis_para' when 'string' then jsonb_build_array(v->'reforma_gratis_para') else '[]'::jsonb end
$$;

create or replace function public.liberar_troca_gratis(p_modelo text) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update clubes set estadio_visual = coalesce(estadio_visual, '{}'::jsonb)
      || jsonb_build_object('reforma_gratis_para', gratis_para_lista(estadio_visual) || to_jsonb(p_modelo), 'gratis_dada_' || p_modelo, true)
   where dono is not null and coalesce(estadio_visual->>'modelo', 'tradicional') <> p_modelo and not coalesce(estadio_visual ? ('gratis_dada_' || p_modelo), false);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.liberar_troca_gratis(text) from public, anon, authenticated; -- só o administrador, pelo SQL Editor

-- ---------- o que muda de verdade: {modelo_alvo?, cidade_alvo?}; vazio = nada muda ----------
create or replace function public.troca_do_estadio(p_clube bigint, p_modelo text, p_cidade text) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_t jsonb := '{}'::jsonb;
begin
  if p_modelo is not null and p_modelo not in ('tradicional', 'caldeirao', 'arena', 'dunas', 'ferradura', 'bomboneira', 'laterais', 'inflavel', 'sansiro', 'wembley', 'maracana') then raise exception 'Modelo desconhecido.'; end if;
  if p_cidade is not null and p_cidade not in ('centro', 'bairro', 'rio', 'lago', 'litoral') then raise exception 'Cidade desconhecida.'; end if;
  if p_modelo is not null and p_modelo <> (select coalesce(estadio_visual->>'modelo', 'tradicional') from clubes where id = p_clube) then
    v_t := v_t || jsonb_build_object('modelo_alvo', p_modelo);
  end if;
  if p_cidade is not null and p_cidade <> cidade_do_estadio(p_clube) then v_t := v_t || jsonb_build_object('cidade_alvo', p_cidade); end if;
  return v_t;
end $$;
revoke execute on function public.troca_do_estadio(bigint, text, text) from public, anon, authenticated;

-- ---------- ampliar (e trocar junto) ----------
drop function if exists public.iniciar_obra(text);
create or replace function public.iniciar_obra(p_estrutura text, p_modelo text default null, p_cidade text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_nivel int; v_custo int; v_taxa int := 0; v_caixa int; v_troca jsonb := '{}'::jsonb;
begin
  select * into v_c from clubes where id = public.meu_clube() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_estrutura not in ('ct', 'medico', 'fisio', 'base', 'estadio') then raise exception 'Estrutura desconhecida.'; end if;
  if p_estrutura <> 'estadio' and (p_modelo is not null or p_cidade is not null) then raise exception 'Modelo e cidade só valem para o estádio.'; end if;
  if p_estrutura = 'estadio' then v_troca := troca_do_estadio(v_c.id, p_modelo, p_cidade); end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida) then raise exception 'Já existe uma obra em andamento. Só cabe uma por vez.'; end if;
  v_nivel := 1 + case p_estrutura when 'ct' then v_c.ct_nivel when 'medico' then v_c.medico_nivel when 'fisio' then v_c.fisio_nivel
    when 'base' then v_c.base_nivel else v_c.estadio_nivel end;
  if v_nivel > (case when p_estrutura = 'estadio' then 8 else 5 end) then raise exception 'Essa estrutura já está no nível máximo.'; end if;
  v_custo := custo_da_obra(p_estrutura, v_nivel);
  if v_troca <> '{}'::jsonb and v_nivel > 2 then v_taxa := round(0.5 * v_custo); end if; -- a primeira ampliação troca de graça
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo + v_taxa then raise exception 'Caixa insuficiente: a obra custa % mil e o caixa é de % mil.', v_custo + v_taxa, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo - v_taxa where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -(v_custo + v_taxa), 'Obra: ' || p_estrutura || ' para o nível ' || v_nivel || case when v_taxa > 0 then ' + troca de modelo/cidade' else '' end);
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, p_estrutura, v_nivel, v_custo + v_taxa, prazo_da_obra(v_nivel), prazo_da_obra(v_nivel));
  if v_troca <> '{}'::jsonb then
    update clubes set estadio_visual = (coalesce(estadio_visual, '{}'::jsonb) - 'modelo_alvo' - 'cidade_alvo') || v_troca where id = v_c.id;
  end if;
end $$;
revoke execute on function public.iniciar_obra(text, text, text) from public, anon;
grant execute on function public.iniciar_obra(text, text, text) to authenticated;

-- ---------- trocar sem ampliar: só a grátis de estádio novo ou no nível 8 ----------
drop function if exists public.reformar_estadio(text);
create or replace function public.reformar_estadio(p_modelo text, p_cidade text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_l ligas%rowtype;
  v_custo int := custo_da_obra('estadio', 8) / 2; v_prazo int := prazo_da_obra(8) / 2; v_caixa int; v_para jsonb; v_troca jsonb;
begin
  select * into v_c from clubes where id = public.meu_clube() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  v_troca := troca_do_estadio(v_c.id, p_modelo, p_cidade);
  if v_troca = '{}'::jsonb then raise exception 'O estádio já é desse modelo e dessa cidade.'; end if;
  if v_troca ? 'modelo_alvo' and coalesce(v_c.estadio_visual->'reforma_gratis_para' ? p_modelo, false) then -- grátis e na hora; ignora a cidade
    if v_c.estadio_visual ? 'modelo_alvo' then raise exception 'Já há uma troca de modelo em andamento.'; end if;
    v_para := gratis_para_lista(v_c.estadio_visual) - p_modelo;
    update clubes set estadio_visual = (estadio_visual - 'reforma_gratis_para') || jsonb_build_object('modelo', p_modelo)
      || case when jsonb_array_length(v_para) > 0 then jsonb_build_object('reforma_gratis_para', v_para) else '{}'::jsonb end where id = v_c.id;
    return;
  end if;
  if v_c.estadio_nivel < 8 then raise exception 'A troca de modelo ou cidade só sai junto com uma ampliação; no nível 8, é uma obra de 15 mi.'; end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida) then raise exception 'Já existe uma obra em andamento. Só cabe uma por vez.'; end if;
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo then raise exception 'Caixa insuficiente: a troca custa % mil e o caixa é de % mil.', v_custo, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: troca de modelo/cidade do estádio');
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, 'estadio_modelo', 8, v_custo, v_prazo, v_prazo);
  update clubes set estadio_visual = (coalesce(estadio_visual, '{}'::jsonb) - 'modelo_alvo' - 'cidade_alvo') || v_troca where id = v_c.id;
end $$;
revoke execute on function public.reformar_estadio(text, text) from public, anon;
grant execute on function public.reformar_estadio(text, text) to authenticated;

-- ---------- visual: igual ao 126, mas a cidade não muda mais aqui ----------
create or replace function public.salvar_estadio_visual(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := public.meu_clube();
  v_atual jsonb; v_novo jsonb; v_cores jsonb; v_c text;
begin
  if v_id is null then raise exception 'Você não tem clube.'; end if;
  if p ? 'cidade' and p->>'cidade' is distinct from cidade_do_estadio(v_id) then raise exception 'A cidade só muda numa ampliação do estádio.'; end if;
  select coalesce(estadio_visual, '{}'::jsonb) into v_atual from clubes where id = v_id for update;
  v_novo := v_atual;
  if p ? 'nomeEstadio' then v_novo := v_novo || jsonb_build_object('nomeEstadio', left(btrim(coalesce(p->>'nomeEstadio', '')), 32)); end if;
  if p ? 'mosaico' then v_novo := v_novo || jsonb_build_object('mosaico', left(btrim(coalesce(p->>'mosaico', '')), 14)); end if;
  if p ? 'padrao' then
    if p->>'padrao' not in ('setor', 'listras', 'sigla') then raise exception 'Padrão desconhecido.'; end if;
    v_novo := v_novo || jsonb_build_object('padrao', p->>'padrao');
  end if;
  if p ? 'cores' then
    v_cores := p->'cores';
    if jsonb_typeof(v_cores) <> 'array' or jsonb_array_length(v_cores) not between 1 and 3 then raise exception 'Escolha de 1 a 3 cores.'; end if;
    for v_c in select jsonb_array_elements_text(v_cores) loop
      if v_c !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Cor inválida: %.', v_c; end if;
    end loop;
    v_novo := v_novo || jsonb_build_object('cores', v_cores);
  end if;
  if p ? 'corEscadas' then
    if coalesce(p->>'corEscadas', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Cor das escadas inválida.'; end if;
    v_novo := v_novo || jsonb_build_object('corEscadas', p->>'corEscadas');
  end if;
  if p ? 'cobertura' then
    if coalesce(p->>'cobertura', '') not in ('', 'N', 'NS', 'NSEW') then raise exception 'Cobertura desconhecida.'; end if;
    v_novo := v_novo || jsonb_build_object('cobertura', coalesce(p->>'cobertura', ''));
  end if;
  if p ? 'muralha' then v_novo := v_novo || jsonb_build_object('muralha', coalesce((p->>'muralha')::boolean, false)); end if;
  update clubes set estadio_visual = v_novo where id = v_id;
  return v_novo;
end $$;
revoke execute on function public.salvar_estadio_visual(jsonb) from public, anon;
grant execute on function public.salvar_estadio_visual(jsonb) to authenticated;

-- ---------- obra concluída: modelo_alvo e cidade_alvo viram o modelo e a cidade ----------
create or replace function public.concluir_reforma_do_estadio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update clubes set estadio_visual = (estadio_visual - 'modelo_alvo' - 'cidade_alvo')
      || case when estadio_visual ? 'modelo_alvo' then jsonb_build_object('modelo', estadio_visual->>'modelo_alvo') else '{}'::jsonb end
      || case when estadio_visual ? 'cidade_alvo' then jsonb_build_object('cidade', estadio_visual->>'cidade_alvo') else '{}'::jsonb end
    where id = new.clube_id and estadio_visual ?| array['modelo_alvo', 'cidade_alvo'];
  return new;
end $$;
drop trigger if exists reforma_do_estadio_concluida on public.obras;
create trigger reforma_do_estadio_concluida after update of concluida on public.obras
  for each row when (new.concluida and not old.concluida and new.estrutura in ('estadio', 'estadio_modelo'))
  execute function public.concluir_reforma_do_estadio();

-- ---------- somem as outras trocas grátis ----------
drop trigger if exists estadio_gratis_para_dono_novo on public.clubes;
drop function if exists public.estadio_gratis_para_dono_novo();
update public.clubes set estadio_visual = estadio_visual - 'reforma_gratis' - 'cidade_trocada' where estadio_visual ?| array['reforma_gratis', 'cidade_trocada'];
