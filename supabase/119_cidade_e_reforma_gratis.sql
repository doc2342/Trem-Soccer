-- Trem Soccer · cidade do estádio e troca grátis de modelo (18/10/2026).
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 116. Pode ser executado mais de uma vez: a troca grátis de modelo só é dada uma vez (marca reforma_gratis_dada).
--
-- Cidade (estadio_visual.cidade: centro, bairro, rio, lago ou litoral): sem escolha, vale a sorteada pelo id do clube (a mesma conta
--   de src/estadio.js). Todo clube tem UMA troca grátis (marca cidade_trocada); depois dela a cidade fica.
-- Modelo: os clubes com dirigente hoje ganham UMA troca grátis e instantânea (marca reforma_gratis), porque o visual chegou com a liga
--   andando. Quem já pagou uma reforma de modelo recebe o dinheiro de volta e a reforma termina na hora (conta como a troca grátis).

-- ---------- presente para os clubes com dirigente ----------
do $$
declare r record; v_n int := 0; v_dev int := 0;
begin
  for r in select c.id, c.liga_id from clubes c where c.dono is not null and not coalesce(c.estadio_visual ? 'reforma_gratis_dada', false) loop
    declare v_o obras%rowtype;
    begin
      select * into v_o from obras where clube_id = r.id and estrutura = 'estadio_modelo' and not concluida;
      if v_o.id is not null then
        update financas set caixa = caixa + v_o.custo where clube_id = r.id;
        insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
          values (r.id, (select temporada from ligas where id = r.liga_id), null, 'obra', v_o.custo, 'Devolução: reforma do estádio (troca grátis de lançamento)');
        update obras set rodadas_restantes = 0, concluida = true where id = v_o.id; -- o gatilho do 116 aplica o modelo novo
        update clubes set estadio_visual = coalesce(estadio_visual, '{}'::jsonb) || '{"reforma_gratis_dada": true}' where id = r.id;
        v_dev := v_dev + 1;
      else
        update clubes set estadio_visual = coalesce(estadio_visual, '{}'::jsonb) || '{"reforma_gratis": true, "reforma_gratis_dada": true}' where id = r.id;
        v_n := v_n + 1;
      end if;
    end;
  end loop;
  raise notice 'Troca grátis de modelo: % clubes; reformas devolvidas e concluídas: %', v_n, v_dev;
end $$;

-- cidade de hoje: a escolhida ou a sorteada pelo id (mesma ordem de CIDADES em src/estadio.js)
create or replace function public.cidade_do_estadio(p_clube bigint) returns text language sql stable set search_path = public as $$
  select coalesce(c.estadio_visual->>'cidade', (array['centro', 'bairro', 'rio', 'lago', 'litoral'])[abs(c.id) % 5 + 1]) from clubes c where c.id = p_clube
$$;

-- ---------- salvar o visual: agora com a cidade (uma troca grátis) ----------
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
  if p ? 'cidade' and p->>'cidade' is distinct from cidade_do_estadio(v_id) then
    if coalesce(p->>'cidade', '') not in ('centro', 'bairro', 'rio', 'lago', 'litoral') then raise exception 'Cidade desconhecida.'; end if;
    if coalesce((v_atual->>'cidade_trocada')::boolean, false) then raise exception 'A troca grátis de cidade já foi usada.'; end if;
    v_novo := v_novo || jsonb_build_object('cidade', p->>'cidade', 'cidade_trocada', true);
  end if;
  update clubes set estadio_visual = v_novo where id = v_id;
  return v_novo;
end $$;
revoke execute on function public.salvar_estadio_visual(jsonb) from public, anon;
grant execute on function public.salvar_estadio_visual(jsonb) to authenticated;

-- ---------- reforma de modelo: a troca grátis é na hora e não ocupa a vaga de obra ----------
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
  if exists (select 1 from obras where clube_id = v_c.id and estrutura = 'estadio_modelo' and not concluida) then raise exception 'Já há uma reforma de modelo em andamento.'; end if;
  if coalesce((v_c.estadio_visual->>'reforma_gratis')::boolean, false) then
    update clubes set estadio_visual = (estadio_visual - 'reforma_gratis' - 'modelo_alvo') || jsonb_build_object('modelo', p_modelo) where id = v_c.id;
    return;
  end if;
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
