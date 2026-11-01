# Grade 5×5: fontes do tiro de meta, saída de bola e decisão

Lote salvo pelo dono em 31/10/2026 em `prototipos/` (14 textos), lido inteiro. Mais as buscas da Tarefa 9c.

## Números

| Dado | Valor | Fonte |
|---|---|---|
| Tiros de meta na própria área, Premier League | 44,6% (2023/24), 50,7% (2024/25) | Opta, Goalkeeper Passing Habits |
| Saem do terço defensivo | 13 de 20 times acima de 40%; o 7º mais longo, 52%; Spurs 6%, Chelsea 14% | Opta |
| Extremos, na própria área | Chelsea 84%, Spurs 82%, Forest 16,7% (goleiro) | Opta |
| Comprimento médio do tiro de meta | 56 m (2013/14), 36,1 m (2023/24), 33,3 m (2024/25) | Opta |
| Acerto de passe do goleiro | 44% (2006/07), 68,9% (2024/25) | Opta |
| Passes longos do goleiro (≥ 32 m) | 79,3% (2014/15), 46,6% (2023/24), 47,0% (2024/25), 51,9% (3 rodadas de 2025/26) | Opta, tendências 2025/26 |
| Progressão: curto × longo | 49 m × 38 m; todo time progride mais no curto | Premier League 2019/20 |
| Jogadas de tiro de meta curto × longo (288 jogos) | chutes a favor 36 × 21, gols a favor 5 × 0; chutes sofridos 42 × 34, gols sofridos 9 × 2 | Premier League 2019/20 |
| Tiros de meta por jogo | 11,7 (595 em 51 jogos) | Human Movement, Euro 2020 |
| Copa do Mundo Sub-17 | curtos 17% (2023), 39% (2025); os do goleiro: 45% longos | FIFA Training Centre |
| Brasileirão 2022 | o Fluminense de Diniz, com menos passes longos da liga: 31,14 em 418,98 por 90 min | TFA |
| Gols contra na Premier League | mais de 1.000 em 35.478 gols, ~3% | Opta; contagem histórica de gols |

Sem número: tiro de meta curto/longo do Brasileirão, taxa de rebote de uma liga, gols olímpicos por temporada.

## Conclusões para o motor

- **Curto é maioria por pouco**, e a definição muda a conta: 51% na própria área, ~55% sem sair do terço defensivo. Base do motor: ~56%. A tendência virou em 2025/26 (amostra de 3 rodadas).
- **A instrução de passe cobre a identidade:** o motor dá 77% e 23% de curtos a curto e longo, perto de Chelsea (84%) e Forest (17%).
- **Risco do curto:** dá mais chutes a favor e mais chutes contra. Estimativa nossa, juntando fontes: ~12 tiros de meta por jogo × 288 jogos, 40% curtos (Stats Perform, 2019/20) → ~3% dos curtos viram chute sofrido e ~0,7% gol sofrido.
- **Regra:** o adversário fica fora da área até a bola rolar, então o 1º passe curto sai sem pressão; a pressão pega quem recebe. Não há impedimento direto do tiro de meta.

## Propostas (não implementadas, esperam o dono)

1. Goleiro que segura a bola é transição: o adversário está desorganizado, e ele rola, lança ou sai no contra-ataque (Dissecting build-up).
2. Tiro de meta longo nas costas da linha alta, sem impedimento: raro, um contra um, só com goleiro de lançamento (Ederson; Variation of Goal Kick Setups).
3. Bola longa com carga de um lado: mais gente na queda ganha a segunda bola (Analyzing the Variants; já é a presença da `sobra`).
4. Movimentação: "a well-timed run can be more dangerous than a faster run" (The Art of Space); Cruyff, "speed is insight". Hoje a corrida do passe no espaço é só Velocidade.
5. Decisão separada da execução: percepção → decisão → execução; o jogador tecnicamente bom pode decidir mal (How Do Players Make Decisions?).
6. Passes curtos como ferramenta: criam estrutura e encurtam a transição negativa (The Purpose of Those Short Passes). Para a Tarefa 12, saída pelos volantes.
7. Diniz: goleiro + dois volantes criam 5×2 na saída; pressão homem a homem até no goleiro; PPDA 8,16.
