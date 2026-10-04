-- Trem Soccer · fase 2, passo E1: salários, contratos e teto de folha.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Depois, na página de administração, clicar em "Definir salários e contratos iniciais".
-- Pode ser executado mais de uma vez sem apagar dados. Valores em milhares por temporada.

alter table public.jogadores add column if not exists salario int;          -- o que o clube paga
alter table public.jogadores add column if not exists salario_mercado int;  -- o mínimo que o jogador aceita; refeito na renovação
alter table public.jogadores add column if not exists contrato_ate int;     -- última temporada coberta pelo contrato
alter table public.jogadores add column if not exists protegido_ate int;    -- até o fim desta temporada a cláusula não vale (primeiro contrato no clube)
alter table public.ligas add column if not exists teto_folha int not null default 14000; -- na temporada 0, o teto da segunda divisão

-- Grava salário e contrato de vários jogadores de uma vez. Só administrador (usado na criação da liga).
create or replace function public.definir_contratos(p jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só o administrador define os contratos iniciais.'; end if;
  update jogadores j set salario = x.salario, salario_mercado = x.mercado, contrato_ate = x.contrato_ate, protegido_ate = x.protegido_ate
  from jsonb_to_recordset(p) as x(id bigint, salario int, mercado int, contrato_ate int, protegido_ate int)
  where j.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Aumenta o salário de um jogador do próprio clube (p_temporadas = 0) ou renova o contrato por 1 a 3 temporadas.
-- O salário nunca desce; na renovação não pode ficar abaixo do salário de mercado; a folha não pode passar do teto;
-- um jogador não pode ganhar mais de 15% do teto.
create or replace function public.ajustar_contrato(p_jogador bigint, p_salario int, p_temporadas int default 0) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_j jogadores%rowtype;
  v_c clubes%rowtype;
  v_l ligas%rowtype;
  v_folha int;
begin
  select * into v_j from jogadores where id = p_jogador;
  if v_j.id is null then raise exception 'Jogador não encontrado.'; end if;
  select * into v_c from clubes where id = v_j.clube_id;
  if v_c.dono is null or v_c.dono <> auth.uid() then raise exception 'Esse jogador não é do seu clube.'; end if;
  select * into v_l from ligas where id = v_c.liga_id;
  if v_j.salario is null then raise exception 'Os contratos desta liga ainda não foram definidos.'; end if;
  if p_temporadas is null or p_temporadas < 0 or p_temporadas > 3 then raise exception 'A renovação é por 1, 2 ou 3 temporadas.'; end if;
  if p_salario is null or p_salario < v_j.salario then raise exception 'O salário não pode diminuir.'; end if;
  if p_temporadas > 0 and p_salario < v_j.salario_mercado then raise exception 'Para renovar, o jogador pede pelo menos % mil por temporada.', v_j.salario_mercado; end if;
  if p_temporadas = 0 and p_salario = v_j.salario then raise exception 'O salário novo é igual ao atual.'; end if;
  if p_salario > v_l.teto_folha * 0.15 then raise exception 'Um jogador não pode ganhar mais de 15%% do teto de folha (% mil).', round(v_l.teto_folha * 0.15); end if;
  select coalesce(sum(salario), 0) into v_folha from jogadores where clube_id = v_c.id;
  if v_folha - v_j.salario + p_salario > v_l.teto_folha then
    raise exception 'A folha passaria do teto: ficaria em % mil, e o teto é % mil.', v_folha - v_j.salario + p_salario, v_l.teto_folha;
  end if;
  update jogadores set salario = p_salario,
    contrato_ate = case when p_temporadas > 0 then v_l.temporada + p_temporadas else contrato_ate end
  where id = p_jogador;
end $$;

revoke execute on function public.definir_contratos(jsonb) from public, anon;
revoke execute on function public.ajustar_contrato(bigint, int, int) from public, anon;
grant execute on function public.definir_contratos(jsonb) to authenticated;
grant execute on function public.ajustar_contrato(bigint, int, int) to authenticated;
