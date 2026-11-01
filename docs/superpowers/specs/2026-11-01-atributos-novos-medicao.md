# Passe longo, Movimentação e Decisões: medição (01/11/2026)

Plano: `docs/superpowers/plans/2026-11-01-atributos-novos.md`. Só medição: nenhum valor foi ajustado aqui.

## O critério da Tarefa 7 NÃO passou

Valor de cada atributo: linha inteira +6, mesmo onze contra si, 4-2-3-1, 1.500 jogos por célula, saldo de xG por jogo (`ferramentas/sim_atributos_novos.mjs`). Ruído ~±0,02.

| Linha | Passe longo | Movimentação | Decisões | Passe (régua) |
|---|---|---|---|---|
| Goleiro | 0,000 | 0,000 | +0,004 | 0,000 |
| Defesa | +0,003 | +0,005 | **−0,066** | +0,056 |
| Volante | −0,008 | −0,001 | +0,028 | +0,125 |
| Meio | +0,007 | +0,002 | **+0,092** | +0,053 |
| Ataque | −0,002 | +0,003 | +0,016 | +0,015 |

| Critério | Resultado |
|---|---|
| Decisões rende na defesa | **Falhou:** −0,066, melhorar o atributo piora o time |
| Decisões rende no volante | Passou, pouco (+0,028) |
| Nenhum dos 3 dá zero em todas as linhas | **Falhou:** Movimentação e Passe longo ficam dentro do ruído no saldo |
| Nenhum vale mais que +6 em Passe na mesma linha | **Falhou:** Decisões no meio, +0,092 × +0,053 |

Passe longo muda o jogo, mas não o saldo: +12 no time inteiro leva as bolas longas de 910 para 1.351 em 300 jogos e as ganhas de 405 para 620 (45%, 46%). Lança mais com o mesmo acerto, e bola longa já está em 31% dos passes (meta ~10%).

Movimentação pesa 10 a 12 na nota de FC, SC e PONTA e não aparece no saldo: as leituras dela são lances raros (passe no espaço 0,42 por time, rebote 0,38 por jogo).

## Por que Decisões piora a defesa

Decomposição (+6 na defesa, 1.000 jogos):

| Caso | Saldo |
|---|---|
| Normal | −0,079 |
| Sem a escolha do passo (`decisao.inclinacao` 0) | **+0,036** |
| Sem a queda sob pressão | −0,079 |
| Sem reciclar a posse | −0,054 |
| +6 em Posicionamento, para comparar | +0,059 |

O defeito é a escolha: quanto mais o jogador segue `valorDe`, pior para o time. A leitura nova de Decisões na defesa funciona (+0,036). A fórmula da escolha é de antes deste plano, que só trocou de onde vem o número; a queda sob pressão não muda nada aqui. Bola longa não é a causa: `pular` cai de 14,7% para 13,9% com o reforço.

Suspeita: `risco: 3` em `valorDe`. Perto do próprio gol, a perda vale 3 × o xT da zona espelhada (faixa 5), quase toda opção fica negativa e `Math.max(1e-9, …)` as iguala.

+6 em Decisões conforme o `risco` (800 jogos, sem nada gravado no motor):

| `risco` | Defesa | Volante | Meio | Gols do espelho 4-2-3-1 |
|---|---|---|---|---|
| 3 (hoje) | −0,074 | +0,042 | +0,104 | 2,42 |
| 1,5 | +0,051 | +0,030 | +0,062 | 2,28 |
| 0,75 | −0,030 | −0,011 | +0,010 | 2,17 |

Com 1,5, Decisões cumpre o critério, mas a curva não é monotônica e os gols caem. É um caminho, não a resposta.

## O que mudou no jogo (3.000 jogos, antes × depois da Tarefa 5)

| Medida | Antes | Depois | Meta |
|---|---|---|---|
| Gols por jogo | 2,84 | 2,79 | 2,48–2,88 |
| Acerto de passe | 83,3% | 83,1% | 82–84% |
| Bola longa (% dos passes) | 30,5% | 31,7% | ~10% |
| Enfiadas por time | 1,36 | 1,28 | 2–6 |
| Rebotes por jogo | 0,38 | 0,38 | 0,35–0,5 |
| Passes no espaço por time | 0,45 | 0,42 | sem meta |
| Passes entrelinhas por time | 1,24 | 1,36 | sem meta |

Saíram da faixa: terceiro homem 0,59 → 0,65 (meta ~0,4); gols contra 3,5% → 3,7% (2–3%); 4-2-3-1 × losango −0,22 → +0,07 (meta < 0). O 4-2-3-1 × 4-4-2 melhorou, −0,18 → −0,04, ainda fora.

## Para a Tarefa 12 (antes de fechar as metas)

1. **Primeiro `risco` e `valorDe`:** quem decide melhor tem que render mais em todas as linhas. Refazer `sim_atributos_novos.mjs` depois de cada rodada.
2. **Movimentação precisa de volume:** subir o passe no espaço (enfiadas 1,28 × meta 2–6) e rodar de novo. A mancha de contra-ataque, na etapa dos papéis, é a outra leitura prevista. Se continuar em zero, baixar o peso dela na nota antes da virada.
3. **Passe longo:** com bola longa perto dos 10%, medir de novo se o acerto passa a contar no saldo.
4. **Decisões no meio** vale mais que Passe com `risco` 3; rever junto do item 1.

Nenhuma função pede atributo novo por esta medição. O problema é o valor dos que já existem no jogo.
