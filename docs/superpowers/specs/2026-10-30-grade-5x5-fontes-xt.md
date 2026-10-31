# Grade 5×5 — o que as fontes de xT e valor de posse dizem (insumo para o spec)

Lidos em 31/10/2026 os 15 PDFs salvos em `prototipos/` a partir das 23:41 de 30/10:
- Karun Singh (o xT original);
- penaltyblog (cálculo por álgebra linear e o modelo pré-treinado da v1.11);
- DataBallPy, Footballizer, Hudl e one-versus-one;
- "Expected Threat in Football, Explained";
- Torvaney ("Extensions to xThreat");
- ASA (g+), StatsBomb (OBV);
- Marc Lamberts (CxT);
- Everett et al. (xT contextual).

Os PDFs do conector Opta e do MatchFlow da penaltyblog só falam de pipeline de dados e não trazem nada para o motor. Os valores das grades foram lidos das figuras do PDF da penaltyblog (a grade dele e a da Soccermatics, as duas em 16×12).

## O que é

xT(zona) = chance de a posse virar gol nas próximas ~5 ações com a bola naquela zona. A conta é: chute × conversão + passe × Σ (para onde vai × xT do destino). O valor de uma ação é xT(destino) − xT(origem). É um processo de Markov sobre uma grade, que é exatamente o caminho livre que a 5×5 vai ter.

## Grade de xT convertida para a 5×5 (Soccermatics/Karun, Premier League)

Colunas da grade 16×12 agrupadas nas faixas. Faixa 1: 0–33 m, 2: 33–52 m, 3: 52–72 m, 4: 72–92 m, 5: a área. Corredores: lado 0–11 m, meio-espaço 11–23 m, centro 23–45 m. São aproximações.

| Faixa | lado | meio-espaço | centro |
|---|---|---|---|
| 5 (atacantes, área) | 0,133 | 0,151 | **0,224** (pequena área 0,38–0,42) |
| 4 (meia ofensivo) | 0,073 | 0,077 | 0,076 |
| 3 (meias) | 0,031 | 0,032 | 0,034 |
| 2 (volantes) | 0,018 | 0,017 | 0,017 |
| 1 (zagueiros) | 0,009 | 0,009 | 0,009 |

A grade da própria penaltyblog (2017–23, ~3 milhões de eventos) tem a mesma forma: 0,01–0,02 na própria metade, 0,13 a 0,14 no lado da área e 0,33–0,35 na pequena área.

## Achados, item por item

1. **O valor dobra a cada faixa.** Vai de 0,009 a 0,017, 0,032, 0,075 e 0,13–0,22. → Meta de calibragem: medir no motor a chance de gol da jogada a partir de cada zona (gols ÷ jogadas que passaram por ela) e comparar com a tabela, na proporção entre faixas (a escala absoluta depende de quantas ações o motor conta).
2. **Até a faixa 4 o valor é plano na largura** (lado = meio-espaço = centro). Só na área o centro vale mais (0,22 contra 0,13 do lado). → O meio-espaço não deve ganhar bônus por estar lá. O valor dele vem das rotas que abre (diagonal, perder menos a bola), como dizem os números do Athletic. Isso confirma a decisão de a vantagem estar nas rotas.
3. **Pular faixa compensa.** Da faixa 2 à 4 o xT vai de 0,017 a 0,075 (×4,4). Na média, o passe longo é o que mais soma xT (longo > médio > muito longo > curto, Lamberts). → O passe que pula faixa vale a pena e o muito longo rende menos. É a meta para a dificuldade crescente do pulo.
4. **O acerto do passe cai perto do gol.** Média de 78,4% (Eredivisie, 1,18 milhão de passes) e 79% na penaltyblog. No meio-campo central é 85–87%; perto da linha de fundo e nos cantos da área, 32–49%. → Meta de dificuldade do passo por faixa: fácil no meio, difícil na última faixa. Ressalva: o duelo do motor é passar uma linha marcada, não só completar um passe; comparar a tendência, não o número.
5. **A virada longa tem 42% de acerto** (a de Pröpper, CxT), o que bate com os 40% da Opta. Confirma a meta da virada.
6. **Recuar não é erro.** O xT de Karun desconta o passe para trás. O CxT mostra que um passe curto para trás dentro da área que mantém a jogada viva vale +0,201 (o xT original dava −0,047), e os modelos comerciais cortam o negativo em zero. → Confirma o desenho: recuar tem risco pequeno e mantém a posse, sem ser punido por "perder terreno".
7. **Decisão = escolher o melhor contra fazer a média.** O xT usa a política média dos jogadores ("média ponderada do que costumam fazer"). O Bellman de verdade usa o máximo (pega a melhor opção). → É exatamente o desenho da Decisão: o bom decisor fica perto do máximo (escolhe a rota de maior valor) e o mau decisor fica perto da média histórica. Dá uma régua teórica para a função de decisão.
8. **Tempo com a bola sobe o valor** (0,0087 com menos de 1 s, 0,0108 com mais de 8 s), porque ter tempo significa não estar pressionado. → Reforça a pressão como o que equilibra as voltas e tira valor da posse.
9. **Perder a bola tem custo pela zona** (Torvaney nº 3, OBV, g+): a perda perto do próprio gol aumenta a chance de sofrer. → Confirma que o contra-ataque começa na zona da roubada. Perder na faixa 1 deve custar muito mais que perder na faixa 5.
10. **A bola no lado prestes a ser cruzada tem ameaça alta no contexto** (Everett: TAx alto quando a bola está aberta para o cruzamento). → O lado vale pelo cruzamento, não pelo chute.
11. **A divisão do campo não precisa ser uniforme.** Torvaney sugere as divisões do Juego de Posición (os nossos 5 corredores) e mais detalhe na metade de ataque. Confirma a 5×5 com faixas por posição.
12. **Situação do placar:** o valor por ação é menor com o jogo empatado (0,0068) e maior quando o time ganha por 2 ou mais (0,0096), porque sobra espaço. Só para medir, sem regra nova.
13. **Quem mais soma xT:** laterais (Holebas, Azpilicueta, Young, Alexander-Arnold, Trippier), volantes (Rodri, Fàbregas, Xhaka, Fernandinho) e até zagueiro (Van Dijk em 2º em 2025-26). → Os laterais, volantes e zagueiros que constroem precisam ganhar valor pela progressão. Isso ajuda a pendência do valor da defesa (zagueiro 41%) e da nota de partida.
14. **Crédito do lance:** o xT dá 86% a Özil e 14% a Kolasinac. O g+ divide o passe difícil meio a meio entre quem passa e quem recebe. O OBV não credita quem recebe. → Fica para a revisão das notas (xA do criador): crédito pela diferença de valor da zona.

## Matriz de transição do Karun convertida para a 5×5 (adicionado em 31/10)

O HTML salvo do blog do Karun aponta para os dados do mapa interativo. Foram baixados do site dele `markov_all.json` (16×12, Premier League 2017/18; por casa: chance de chutar, xG e para onde vão os passes e conduções bem-sucedidos) e `open_xt_12x8_v1.json` (a grade oficial de xT 12×8). As contas estão em `scratchpad/karun/agrega.py` e `lateral.py`. As casas de cada zona pesam igual. Conta só o movimento que deu certo.

Para onde vai a bola a partir de cada zona (% dos movimentos):

| Origem | chuta | volta faixa | mesma faixa | +1 faixa | +2 ou mais | +1 reto | +1 diagonal |
|---|---|---|---|---|---|---|---|
| faixa 5 lado | 0 | 36 | 64 | – | – | – | – |
| faixa 5 meio-espaço | 13 | 25 | 75 | – | – | – | – |
| faixa 5 centro | 77 | 20 | 80 | – | – | – | – |
| faixa 4 lado | 0 | 22 | 57 | 21 | 0 | 12 | 4 |
| faixa 4 meio-espaço | 9 | 13 | 62 | 25 | 0 | 11 | 12 |
| faixa 4 centro | 28 | 12 | 67 | 21 | 0 | 9 | 9 |
| faixa 3 lado | 0 | 22 | 50 | 25 | 3 | 16 | 6 |
| faixa 3 meio-espaço | 0 | 16 | 54 | 27 | 3 | 8 | **17** |
| faixa 3 centro | 0 | 13 | 54 | 30 | 3 | 12 | 9 |
| faixa 2 lado | 0 | 22 | 46 | 25 | 8 | 15 | 7 |
| faixa 2 meio-espaço | 0 | 15 | 48 | 29 | 7 | 9 | **18** |
| faixa 2 centro | 0 | 13 | 49 | 32 | 7 | 11 | 12 |
| faixa 1 lado | 0 | – | 64 | 25 | 11 | 15 | 8 |
| faixa 1 meio-espaço | 0 | – | 63 | 26 | 11 | 9 | 15 |
| faixa 1 centro | 0 | – | 55 | 27 | 19 | 9 | 10 |

Dentro da mesma faixa, a maior parte fica na própria zona (condução e passe curto). Por exemplo, na faixa 3: lado 26% na zona e 19% para a vizinha; meio-espaço 17% e 33%; centro 23% e 21%. A virada lado→lado é ~1% dos movimentos que saem do lado.

O que tirar disso:
- **A diagonal é confirmada com número:** do meio-espaço, o passo para a frente em diagonal (17–18%) é o dobro do reto (8–9%). Do lado, o reto ganha (15% contra 7%), porque a linha lateral fecha um dos lados. Do centro, os dois ficam parecidos. → Meta direta para os pesos das rotas.
- **Voltar:** 12–13% dos movimentos que saem do centro e 22% dos que saem do lado (o lado prende mais), contra 25–31% de avanços de uma faixa. → A volta é frequente: cerca de metade dos avanços.
- **Pular faixa:** 19% saindo da faixa 1 centro, ~11% dos lados da faixa 1, ~7% da faixa 2 e ~3% da faixa 3. → Meta para a frequência do pulo por faixa.
- **A virada longa lado→lado é rara** (~1%). Ela tem que existir, mas pouco.
- **Onde se chuta:** a faixa 5 centro chuta em 77% das posses, o meio-espaço dela em 13% e o lado em ~0% (do lado se cruza). A faixa 4 centro chuta em 28% e o meio-espaço em 9%. → Bate com os tipos de chance por coluna.
- Os movimentos dentro da própria zona não aparecem no motor, que só conta a troca de zona. Na calibragem, comparar só os movimentos que trocam de zona.
