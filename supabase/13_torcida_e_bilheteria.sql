-- Trem Soccer · fase 2, passo E3: torcida, humor e bilheteria.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Precisa do 12_caixa.sql já executado. Não exige publicar a função "rodada" de novo.
-- Pode ser executado mais de uma vez sem apagar dados.

alter table public.clubes add column if not exists estadio_nivel smallint not null default 1;   -- 1 a 5: 10, 15, 20, 25 e 30 mil lugares
alter table public.clubes add column if not exists torcida int not null default 14000;          -- torcedores que querem ir ao jogo
alter table public.clubes add column if not exists humor numeric(4,1) not null default 8;       -- 0 (revoltada) a 16 (eufórica)
alter table public.ligas add column if not exists torcida_base int not null default 14000;      -- temporada 0 usa a segunda divisão
alter table public.ligas add column if not exists preco_ingresso int not null default 24;       -- fixo por divisão
alter table public.partidas add column if not exists publico int;

-- Lançamentos de uma partida de liga: TV, patrocínio e salários para os dois clubes, bilheteria para o mandante,
-- e o efeito do resultado no humor e no tamanho da torcida dos dois. Só roda uma vez por partida.
create or replace function public.lancar_rodada(p_partida bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p partidas%rowtype;
  v_l ligas%rowtype;
  v_r resultados%rowtype;
  v_c clubes%rowtype;
  v_clube bigint;
  v_tv int; v_pat int; v_folha int; v_total int;
  v_publico int; v_bilheteria int;
  v_saldo int; v_dh numeric; v_dt numeric;
begin
  if not (public.eh_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'Sem permissão.'; end if;
  select * into v_p from partidas where id = p_partida for update;
  if v_p.id is null or v_p.financeiro then return; end if;
  select * into v_l from ligas where id = v_p.liga_id;
  select * into v_r from resultados where partida_id = p_partida;
  v_tv := round(v_l.receita_tv::numeric / v_l.rodadas_por_temporada);
  v_pat := round(v_l.receita_patrocinio::numeric / v_l.rodadas_por_temporada);

  -- público: a torcida do mandante, mais ou menos animada conforme o humor, com 10% de sobe e desce pelo clima,
  -- mais um décimo da torcida visitante; limitado pelos lugares do estádio
  select * into v_c from clubes where id = v_p.casa;
  v_publico := least(5000 + 5000 * v_c.estadio_nivel,
    round(v_c.torcida * (0.85 + 0.3 * v_c.humor / 16) * (0.9 + 0.2 * random())
      + 0.1 * (select torcida from clubes where id = v_p.fora)));
  v_bilheteria := round(v_publico * v_l.preco_ingresso / 1000.0);
  update partidas set publico = v_publico where id = p_partida;

  foreach v_clube in array array[v_p.casa, v_p.fora] loop
    select round(coalesce(sum(salario), 0)::numeric / v_l.rodadas_por_temporada) into v_folha from jogadores where clube_id = v_clube;
    v_total := v_tv + v_pat - v_folha;
    insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao) values
      (v_clube, v_l.temporada, v_p.rodada, 'tv', v_tv, 'Cota de TV'),
      (v_clube, v_l.temporada, v_p.rodada, 'patrocinio', v_pat, 'Patrocínio'),
      (v_clube, v_l.temporada, v_p.rodada, 'salarios', -v_folha, 'Salários dos jogadores');
    if v_clube = v_p.casa then
      insert into lancamentos (clube_id, temporada, rodada, tipo, valor, descricao)
        values (v_clube, v_l.temporada, v_p.rodada, 'bilheteria', v_bilheteria, 'Bilheteria (' || v_publico || ' pagantes)');
      v_total := v_total + v_bilheteria;
    end if;
    insert into financas (clube_id, caixa) values (v_clube, 5000 + v_total)
      on conflict (clube_id) do update set caixa = financas.caixa + v_total;

    -- resultado: mexe no humor (que também volta devagar para o meio) e na torcida, entre 80% e 140% da base da divisão
    if v_r.partida_id is not null then
      v_saldo := case when v_clube = v_p.casa then v_r.gols_casa - v_r.gols_fora else v_r.gols_fora - v_r.gols_casa end;
      if v_saldo > 0 then v_dh := 1; v_dt := 0.01;
      elsif v_saldo = 0 then v_dh := case when v_clube = v_p.casa then -0.3 else 0.2 end; v_dt := 0;
      else v_dh := case when v_clube = v_p.casa then -1 else -0.7 end; v_dt := -0.01;
      end if;
      update clubes set
        humor = least(16, greatest(0, humor + v_dh + (8 - humor) * 0.05)),
        torcida = least(round(v_l.torcida_base * 1.4), greatest(round(v_l.torcida_base * 0.8), round(torcida * (1 + v_dt))))
      where id = v_clube;
    end if;
  end loop;
  update partidas set financeiro = true where id = p_partida;
end $$;
revoke execute on function public.lancar_rodada(bigint) from public, anon;
grant execute on function public.lancar_rodada(bigint) to authenticated, service_role;
