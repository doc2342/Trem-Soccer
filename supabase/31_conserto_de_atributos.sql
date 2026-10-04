-- Trem Soccer · conserto: jogadores de reposição criados sem atributos e pontos de treino vazios.
-- Como usar: no painel do Supabase, abrir SQL Editor, colar este arquivo inteiro e clicar em Run.
-- Antes ou depois, republicar as funções "rodada" e "mercado" (as duas tinham o defeito que causou isto).
-- Pode ser executado mais de uma vez: só mexe em quem está com o defeito.
--
-- O que aconteceu: as funções do servidor perdiam o valor máximo dos atributos (50). Com isso,
--   1. o jogador que entra no lugar do comprado pela multa, em clube sem dono, nascia com os 22 atributos vazios;
--   2. a primeira sessão de treino gravou pontos vazios (os atributos dos jogadores não foram alterados).

-- 1. quem está sem atributos recebe os de um companheiro da mesma posição (ou, se não houver, de qualquer jogador da posição)
update public.jogadores j set at = (
    select x.at from public.jogadores x
      where x.pos = j.pos and x.id <> j.id and x.clube_id is not null and array_position(x.at, null) is null
      order by (x.clube_id = j.clube_id) desc, abs(x.idade - j.idade), x.id
      limit 1)
  where array_position(j.at, null) is not null;
-- e, se ficaram sem salário, o salário de um companheiro da mesma posição
update public.jogadores j set
    salario = (select x.salario from public.jogadores x where x.clube_id = j.clube_id and x.pos = j.pos and x.id <> j.id and x.salario is not null order by x.id limit 1),
    salario_mercado = (select x.salario_mercado from public.jogadores x where x.clube_id = j.clube_id and x.pos = j.pos and x.id <> j.id and x.salario is not null order by x.id limit 1)
  where j.clube_id is not null and j.salario is null
    and exists (select 1 from public.jogadores x where x.clube_id = j.clube_id and x.salario is not null);

-- 2. pontos de treino vazios voltam a zero (a função corrigida recomeça a contar)
update public.jogadores set treino_pts = null where treino_pts is not null and array_position(treino_pts, null) is not null;

-- conferência: as duas contagens têm de dar zero
select (select count(*) from public.jogadores where array_position(at, null) is not null) as sem_atributos,
       (select count(*) from public.jogadores where treino_pts is not null and array_position(treino_pts, null) is not null) as pontos_vazios;
