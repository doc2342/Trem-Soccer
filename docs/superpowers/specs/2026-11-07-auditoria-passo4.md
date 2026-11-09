# Auditoria do passo 4 (07/11/2026): etapa D do plano de sinergias

Mesmo método da auditoria de 02/11 (`2026-11-02-auditoria-atributos.md`): `ferramentas/sim_auditoria.mjs`, 4-2-3-1, linha inteira +18 no atributo,
6000 jogos por célula, 40 pares de onzes, nível 30, regras da T1 (grade ligada). Código local de 07/11: passos 1–3 da revisão, papéis, faltas na grade
(faltaDomina) e passagem do Apoiador pela função do ponta. Células em `logs-testes/auditoria_0711/`, régua em `logs-testes/regua_0711.txt`.

## Gols pró / contra, 4-2-3-1

| Atributo | goleiro | defesa | volante | meio | ataque |
|---|---|---|---|---|---|
| ref | -0.010 / +0.156 | exato | exato | exato | exato |
| pos | -0.005 / +0.056 | +0.001 / +0.141 | +0.026 / +0.046 | +0.023 / +0.003 | +0.064 / -0.000 |
| cru | exato | +0.016 / -0.002 | -0.018 / -0.019 | +0.077 / -0.019 | -0.002 / -0.016 |
| lon | exato | +0.002 / -0.006 | +0.004 / -0.008 | +0.088 / -0.023 | +0.007 / +0.002 |
| for | -0.008 / +0.029 | +0.011 / +0.014 | +0.006 / +0.007 | +0.002 / -0.002 | +0.040 / +0.001 |
| inf | +0.019 / +0.010 | +0.040 / +0.022 | +0.027 / +0.019 | +0.037 / +0.019 | +0.019 / +0.008 |
| dec | +0.018 / -0.007 | +0.048 / +0.091 | +0.058 / +0.035 | +0.148 / +0.030 | -0.018 / +0.001 |
| com | +0.001 / -0.009 | +0.007 / -0.001 | -0.009 / -0.012 | -0.011 / +0.010 | -0.014 / +0.006 |
| cab | exato | +0.025 / +0.015 | +0.017 / +0.009 | +0.026 / -0.002 | +0.064 / -0.003 |
| dom | exato | +0.043 / +0.022 | +0.073 / +0.018 | +0.179 / -0.004 | +0.098 / -0.015 |
| vel | +0.001 / +0.005 | +0.063 / +0.068 | +0.044 / +0.030 | +0.142 / -0.025 | +0.081 / -0.027 |
| agr | +0.004 / -0.004 | +0.029 / +0.045 | +0.048 / +0.039 | +0.059 / +0.005 | +0.047 / +0.017 |
| mov | exato | +0.005 / -0.017 | +0.004 / -0.016 | +0.077 / -0.031 | +0.057 / -0.037 |
| enc | -0.001 / +0.044 | exato | exato | exato | exato |
| mar | exato | +0.006 / +0.128 | -0.005 / +0.039 | +0.005 / -0.012 | +0.001 / +0.003 |
| pas | exato | +0.049 / -0.020 | +0.074 / -0.002 | +0.103 / -0.002 | +0.034 / -0.021 |
| dri | exato | +0.022 / -0.008 | +0.021 / -0.002 | +0.125 / -0.014 | +0.014 / -0.002 |
| equ | -0.005 / -0.000 | +0.020 / -0.013 | -0.004 / -0.019 | +0.018 / -0.002 | -0.001 / -0.004 |
| plo | +0.002 / +0.000 | +0.043 / -0.012 | +0.007 / -0.004 | +0.001 / +0.000 | +0.003 / +0.003 |
| um | -0.002 / +0.051 | exato | exato | exato | exato |
| des | exato | +0.012 / +0.070 | +0.005 / +0.018 | +0.021 / -0.004 | +0.002 / -0.002 |
| cri | exato | +0.013 / -0.003 | +0.047 / -0.013 | +0.120 / -0.004 | +0.078 / -0.028 |
| fin | exato | +0.005 / -0.001 | +0.001 / -0.000 | +0.064 / +0.002 | +0.116 / -0.011 |
| res | +0.001 / +0.003 | -0.004 / +0.005 | +0.018 / +0.023 | +0.011 / +0.002 | +0.034 / +0.007 |
| exc | -0.005 / +0.003 | -0.006 / -0.018 | +0.039 / -0.012 | +0.007 / -0.013 | -0.010 / +0.002 |

## O que mudou desde 02/11

- Agressividade: era zero ou negativa em todas as linhas, agora +0,06 a +0,09 de gols (passo 1: duelo apertado, faltas).
- Força do goleiro: era exato, agora +0,029 contra (segura cruzamento).
- Cruzamento do meio +0,057 e Criatividade do ataque +0,051: o volume de cruzamentos e as pontas do passo 2.
- Decisões do meio +0,138 → +0,179, o atributo mais forte da linha.
- Caiu: Desarme do volante +0,099 → +0,024 e Criatividade do volante +0,107 → +0,033 (papéis de volante; conferir no E).
  Excentricidade do meio +0,065 → -0,006 (esperado: o custo da ousadia do passo 3 só paga com Decisões alta).
  Passe, Drible e Finalização do meio caíram de 0,04 a 0,05 cada (o valor do meio se espalhou por Cruzamento e Movimentação).

## Ainda perto de zero (candidatos do E: mecânica faltando ou peso a cortar na nota)

- Passe longo: zero em goleiro, volante, meio e ataque; só a defesa +0,031.
- Comunicação: zero ou negativa em todas as linhas.
- Trabalho em equipe: zero em todas as linhas.
- Lado contra do ataque: nada (atacante melhor não faz o rival criar menos).
- Marcação do meio: zero.
- Movimentação de defesa e volante: zero (esperado, a corrida é dos de frente).

## Régua de 300 jogos (07/11 × 03/11)

Obrigatórias fora: 5/7, as mesmas de antes. Gols 2,28 (=), conversão no alvo 34,9% (34,7%), pênalti 4,7% (6,3%), escanteio 7,7% (6,7%),
acerto de passe 87,9% (87,6%); contra-ataque 5,0% e cruzamento 14,8% ok.
Esforço que mudou: gols depois dos 75' 0,92 → 1,06 (ok agora); faltas por time 13,4 → 10,9 (agora fora, meta 13,3); amarelos 2,98 → 2,44 (ok);
posses de 10 passes 10,6 → 11,6 (ok agora); rebotes viram gol 25,6% → 35,3% e gols de rebote 4,7% → 7,5% (agora fora); enfiadas 2,24 → 1,93 (fora por
pouco); 4-1-4-1 contra 5-4-1 +0,36 → +0,63 (continua fora); 5-3-2 sofre mais cruzamentos mas com acerto maior (fora).
