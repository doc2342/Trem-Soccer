-- Trem Soccer · clubes sem dirigente contratam jogadores livres para tapar buracos no banco.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run. Depois, republicar a função "rodada".
-- Precisa do 25_regras_do_leilao.sql, do 72_bots_compram_listados.sql e do 82_mercado_entre_paises.sql. Pode ser executado mais de uma vez.
--
-- Os dirigentes têm prioridade: o bot só olha para o livre que está sem leilão há ligas.bots_livres_horas (48 h) desde que ficou livre.
-- - Só com a janela aberta. Cada livre é olhado UMA vez por janela (bots_viram, o mesmo campo dos listados).
-- - Buraco: titular do bot sem reserva no elenco com 85% da nota dele na posição. O livre precisa ter essa nota (src/mercadobots.js,
--   livresParaOsBots). O maior buraco escolhe primeiro; um livre por bot por janela, 8 por janela na liga inteira.
-- - Contrato de 1 temporada pelo salário de mercado, com as travas de um lance de dirigente: teto da folha, 15% do teto por jogador,
--   30 contratados, 5 estrangeiros. O caixa do bot precisa estar acima de 25% do teto de folha.
-- - Sem mudança no agendamento: a função "rodada" olha a fila sempre que é chamada (partidas, efeitos, negócios dos bots).
--
-- Para testar com o calendário compacto:  update ligas set bots_livres_horas = 0.05;  (3 minutos)

alter table public.jogadores add column if not exists livre_desde timestamptz; -- quando ficou livre (sem clube) pela última vez
alter table public.ligas add column if not exists bots_livres_horas numeric not null default 48;
update public.jogadores set livre_desde = now() where livre_liga is not null and clube_id is null and livre_desde is null;

-- Um gatilho para todos os caminhos que soltam um jogador (dispensa, fim de contrato, virada): anota a hora e zera o olhar dos bots.
create or replace function public.anota_livre_desde() returns trigger language plpgsql set search_path = public as $$
begin
  if new.livre_liga is null then
    new.livre_desde := null;
  elsif tg_op = 'INSERT' or old.livre_liga is null then
    new.livre_desde := now(); new.bots_viram := null;
  end if;
  return new;
end $$;
drop trigger if exists anota_livre_desde on public.jogadores;
create trigger anota_livre_desde before insert or update of livre_liga on public.jogadores for each row execute function public.anota_livre_desde();

-- A fila: livres sem leilão e sem lance, que esperaram o prazo e que os bots ainda não olharam nesta janela.
create or replace function public.livres_para_os_bots(p_liga bigint) returns setof public.jogadores
language sql stable security definer set search_path = public as $$
  select j.* from jogadores j join ligas g on g.id = j.livre_liga
   where j.livre_liga = p_liga and j.clube_id is null and j.livre_ate is null and not coalesce(g.pausada, false)
     and janela_do_mercado(g.id) is not null
     and j.livre_desde <= now() - make_interval(secs => (3600 * g.bots_livres_horas)::int)
     and j.bots_viram is distinct from g.temporada || ':' || janela_do_mercado(g.id)
     and not exists (select 1 from ofertas_livres o where o.jogador_id = j.id)
   order by j.livre_desde, j.id
$$;
revoke execute on function public.livres_para_os_bots(bigint) from public, anon, authenticated;
grant execute on function public.livres_para_os_bots(bigint) to service_role;

-- Fecha a contratação escolhida pela função "rodada". Confere de novo o que pode ter mudado (um dirigente pode ter aberto leilão).
create or replace function public.bot_contrata_livre(p_jogador bigint, p_para bigint, p_salario int) returns text
language plpgsql security definer set search_path = public as $$
declare v_j jogadores%rowtype; v_para clubes%rowtype; v_l ligas%rowtype; v_janela text; v_motivo text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão.'; end if;
  select * into v_j from jogadores where id = p_jogador for update;
  select * into v_para from clubes where id = p_para;
  if v_j.id is null or v_para.id is null or v_para.dono is not null or v_j.clube_id is not null or v_j.livre_liga is distinct from v_para.liga_id then
    raise exception 'Contratação inválida.';
  end if;
  if v_j.livre_ate is not null or exists (select 1 from ofertas_livres where jogador_id = p_jogador) then raise exception 'Há leilão de dirigente.'; end if;
  select * into v_l from ligas where id = v_para.liga_id;
  v_janela := janela_do_mercado(v_l.id);
  if v_janela is null or coalesce(v_l.pausada, false) then raise exception 'O mercado está fechado.'; end if;
  if exists (select 1 from transferencias where liga_id = v_l.id and temporada = v_l.temporada and janela = v_janela and tipo = 'livre' and para_clube = p_para) then
    raise exception 'Esse clube já contratou um livre nesta janela.';
  end if;
  if (select count(*) from transferencias t join clubes c on c.id = t.para_clube
       where t.liga_id = v_l.id and t.temporada = v_l.temporada and t.janela = v_janela and t.tipo = 'livre' and c.dono is null) >= 8 then
    raise exception 'Os bots já contrataram 8 livres nesta janela.';
  end if;
  if coalesce((select caixa from financas where clube_id = p_para), 0) < 0.25 * teto_do_clube(p_para) then raise exception 'O caixa do bot não comporta.'; end if;
  if p_salario is null or p_salario < coalesce(v_j.salario_mercado, 0) then raise exception 'Salário abaixo do de mercado.'; end if;
  v_motivo := coalesce(impedimento_de_contrato(p_para, p_salario), vaga_no_elenco(p_para, v_j.idade), vaga_de_estrangeiro(p_para, p_jogador));
  if v_motivo is not null then raise exception 'Não dá: %.', v_motivo; end if;
  perform contratar_livre(p_jogador, p_para, p_salario, 1);
  return 'ok';
end $$;
revoke execute on function public.bot_contrata_livre(bigint, bigint, int) from public, anon, authenticated;
grant execute on function public.bot_contrata_livre(bigint, bigint, int) to service_role;

select count(*) as livres_hoje, count(*) filter (where livre_desde is not null) as com_hora from public.jogadores where livre_liga is not null and clube_id is null;
