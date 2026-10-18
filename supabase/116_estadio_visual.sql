-- Trem Soccer · visual do estádio (aprovado em 18/10/2026; só cosmético, não muda lugares nem renda).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Pode ser executado mais de uma vez. Precisa do 55 (custo_da_obra, prazo_da_obra) e do 100 (meu_clube). Não exige republicar função.
--
-- clubes.estadio_visual (jsonb): { modelo, nomeEstadio, mosaico, padrao, cores[1–3], corEscadas, cobertura, estacionamento, refletores }.
--   O nível continua em clubes.estadio_nivel. Vazio = Tradicional nas cores do escudo.
-- salvar_estadio_visual: o dono muda de graça nome, mosaico, padrão, cores, cor das escadas e cobertura (só Caldeirão).
--   Estacionamento e refletores ficam de fora até decidir o bônus (só o administrador mexe, direto na coluna).
-- reformar_estadio: trocar de modelo é uma obra (estrutura 'estadio_modelo', a mesma fila de uma obra por vez).
--   Custo: 25% da obra do nível atual (mínimo 250 mil); prazo: metade do prazo do nível atual (mínimo 1 rodada). (decidido em 18/10/2026).
--   O modelo novo fica em estadio_visual.modelo_alvo e vale quando a obra termina (gatilho abaixo; a rodada não precisa mudar:
--   ela só mexe nos níveis das estruturas conhecidas e ignora 'estadio_modelo').

alter table public.clubes add column if not exists estadio_visual jsonb;

create or replace function public.custo_da_reforma(p_nivel int) returns int language sql immutable as $$
  select greatest(250, round(0.25 * coalesce(public.custo_da_obra('estadio', greatest(1, p_nivel)), 1000)))::int
$$;
create or replace function public.prazo_da_reforma(p_nivel int) returns int language sql immutable as $$
  select greatest(1, public.prazo_da_obra(least(8, greatest(1, p_nivel))) / 2)
$$;

create or replace function public.salvar_estadio_visual(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := public.meu_clube();
  v_atual jsonb; v_novo jsonb; v_cores jsonb; v_c text;
begin
  if v_id is null then raise exception 'Você não tem clube.'; end if;
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
  update clubes set estadio_visual = v_novo where id = v_id;
  return v_novo;
end $$;
revoke execute on function public.salvar_estadio_visual(jsonb) from public, anon;
grant execute on function public.salvar_estadio_visual(jsonb) to authenticated;

create or replace function public.reformar_estadio(p_modelo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c clubes%rowtype; v_l ligas%rowtype;
  v_custo int; v_prazo int; v_caixa int;
begin
  select * into v_c from clubes where id = public.meu_clube() for update;
  if v_c.id is null then raise exception 'Você não tem clube.'; end if;
  if p_modelo not in ('tradicional', 'caldeirao', 'arena', 'dunas', 'ferradura') then raise exception 'Modelo desconhecido.'; end if;
  if p_modelo = coalesce(v_c.estadio_visual->>'modelo', 'tradicional') then raise exception 'O estádio já é desse modelo.'; end if;
  if exists (select 1 from obras where clube_id = v_c.id and not concluida) then raise exception 'Já existe uma obra em andamento. Só cabe uma por vez.'; end if;
  v_custo := custo_da_reforma(v_c.estadio_nivel);
  v_prazo := prazo_da_reforma(v_c.estadio_nivel);
  select caixa into v_caixa from financas where clube_id = v_c.id;
  if coalesce(v_caixa, 0) < v_custo then raise exception 'Caixa insuficiente: a reforma custa % mil e o caixa é de % mil.', v_custo, coalesce(v_caixa, 0); end if;
  select * into v_l from ligas where id = v_c.liga_id;
  update financas set caixa = caixa - v_custo where clube_id = v_c.id;
  insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
    values (v_c.id, v_l.temporada, null, 'obra', -v_custo, 'Obra: reforma do estádio para o modelo ' || p_modelo);
  insert into obras (clube_id, estrutura, nivel_alvo, custo, rodadas_total, rodadas_restantes)
    values (v_c.id, 'estadio_modelo', greatest(1, v_c.estadio_nivel), v_custo, v_prazo, v_prazo);
  update clubes set estadio_visual = coalesce(estadio_visual, '{}'::jsonb) || jsonb_build_object('modelo_alvo', p_modelo) where id = v_c.id;
end $$;
revoke execute on function public.reformar_estadio(text) from public, anon;
grant execute on function public.reformar_estadio(text) to authenticated;

-- reforma concluída: o modelo_alvo vira o modelo
create or replace function public.concluir_reforma_do_estadio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update clubes set estadio_visual = (estadio_visual - 'modelo_alvo') || jsonb_build_object('modelo', estadio_visual->>'modelo_alvo')
    where id = new.clube_id and estadio_visual ? 'modelo_alvo';
  return new;
end $$;
drop trigger if exists reforma_do_estadio_concluida on public.obras;
create trigger reforma_do_estadio_concluida after update of concluida on public.obras
  for each row when (new.concluida and not old.concluida and new.estrutura = 'estadio_modelo')
  execute function public.concluir_reforma_do_estadio();
