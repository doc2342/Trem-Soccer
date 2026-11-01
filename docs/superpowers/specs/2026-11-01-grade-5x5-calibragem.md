# Calibragem da grade 5×5 (Tarefa 12)

Relatório em andamento. Ainda sem os Passos 0 a 6.

## Passo inicial: risco/valorDe, Excentricidade e calma (01/11/2026)

### O defeito
Perto do próprio gol quase toda opção tinha valor negativo. `Math.max(1e-9, …)` igualava todas, e a escolha virava sorteio entre as poucas positivas. Quanto melhor o decisor, mais ele seguia esse erro.

### O que mudou
- `escolherPasso` compara as opções da lista: nota de 0 (a pior) a 1 (a melhor). `valorDe` pode ser negativo, e `null` é opção impossível.
- Os multiplicadores saíram do valor e foram para a nota (`multDe`): num valor negativo, trocariam de sentido.
- `posse`: o custo de perder a bola, pela faixa de quem tem a bola: 0,2 / 0,2 / 0,15 / 0,06 / 0,02. Sem ele, lançar sempre compensava (bola longa 52–65% dos passes).
- `risco` 3 → 1,5; `decisao` base 5, inclinação 3 (inclinação 6 piorou a defesa, −0,041), piso 0,02.
- Nova escala dos fins de jogada: cruzamento antecipado 0,025 → 0,12; chute de longe 0,02 → 0,05. Passe no espaço × 2 na nota (`espaco.vontade`). Gol contra no cruzamento 0,035 → 0,006, por causa do volume.
- **Excentricidade:** as opções difíceis (pular, virada, inversão, espaço, entrelinhas, condução para a frente) ganham 1 + 0,3 × faixa × (Excentricidade − 25) / 25, com faixa 0,2 / 0,4 / 0,7 / 1 / 1. Quem decide bem filtra pelo γ. O passo difícil ganho leva mais folga. A chance do duelo não muda.
- **Calma:** 0,7 × (Influência do capitão − 25) / 25 + 0,3 × (Trabalho em equipe do time − 25) / 25. Perdendo, multiplica a força por 1 + 0,1 × calma; sob pressão, segura ou aumenta a queda da Decisão. Só na grade; a T0 segue igual.

### Testado e descartado
Valor da faixa 5 acima do xT (`E` 0,4, `e` 0,2, `C` 0,35): melhorava a régua (pênalti 7% e escanteio 12,8% em combinações próximas), mas Passe na defesa e no volante ia a −0,04 e o contra-ataque ia para os lados (38% por dentro, meta ~80%). O xT da faixa 5 fica como estava.

### Valor por linha (1.000 jogos por célula, ruído ~±0,02)
Linha inteira +6, saldo de xG por jogo. Todos os times sem pressão.

| Linha | Decisões antes | Decisões | Passe longo | Movimentação | Excentricidade | Passe |
|---|---|---|---|---|---|---|
| Goleiro | +0,004 | +0,004 | +0,030 | 0,000 | −0,001 | 0,000 |
| Defesa | **−0,066** | **+0,025** | +0,047 | −0,002 | +0,007 | +0,049 |
| Volante | +0,028 | +0,016 | +0,036 | +0,003 | +0,019 | +0,053 |
| Meio | +0,092 | +0,022 | +0,015 | −0,001 | +0,009 | +0,055 |
| Ataque | +0,016 | +0,007 | 0,000 | −0,001 | +0,002 | +0,068 |

Critério dos atributos: Decisões rende em todas as linhas e nenhum atributo passa do Passe na linha dele. Passe longo saiu do zero. **Movimentação continua em zero**, mesmo com mais passe no espaço. Excentricidade é quase neutra, como pedido: troca risco por chance.

### Régua (1.000 jogos, medida antes de tirar o peso da linha de fundo, que não fez efeito)
| Meta | Antes | Agora | Alvo |
|---|---|---|---|
| Gols por jogo | 2,80 | 2,41 | 2,48–2,88 |
| Conversão no alvo | 34,3% | 34,3% | 27–33% |
| Gols de contra-ataque | 9,5% | 8,8% | 5–7% |
| Gols de cruzamento | 1,7% | **13,5%** | 13–20% |
| Gols de pênalti | 5,3% | 4,4% | 7–11% |
| Gols de escanteio | 6,3% | 6,1% | 10–14% |
| Acerto de passe | 83,1% | 84,9% | 82–84% |
| Volta | 2,7% | 8,9% | 12–22% |
| Pular faixa 1 / 2 / 3 | 30 / 28 / 21% | 34 / 9 / 6% | 19 / 7 / 3% |
| Bola longa | 31,8% | 35,0% | ~10% |
| Posses de 10+ passes | 6,7 | 7,2 | 11–16 |
| Cruzamentos por time | 1,4 | 5,6 | ~19 |
| PPDA pressão 2 / 0 | 13,9 / 11,8 | **5,8 / 9,0** | 5–8 / 15–20 |
| Perda atrás vira chute | 32,6% | 24,0% | ~20% |
| Chutes de contra por dentro | 73,4% | 77,5% | ~80% |
| Gols contra | 3,9% | 3,5% | 2–3% |

O PPDA deixou de estar invertido: quem pressiona mais agora rouba mais. A meta de posses mudou de ~100 para 71–91 (Premier 2024/25); o motor dá 79,9.

### Calma (1.200 jogos, mesmo onze dos dois lados)
| Caso | Pontos por jogo | Saiu atrás e buscou |
|---|---|---|
| Capitão 25 | 1,311 | 24,7% |
| Capitão 45 | 1,349 | 31,2% |
| Capitão 8 | 1,297 | 21,0% |
| Time 32 em Trabalho em equipe | 1,287 | 24,8% |
| Time 18 em Trabalho em equipe | 1,307 | 24,7% |

O efeito do capitão é pequeno, como decidido. O do Trabalho em equipe fica dentro do ruído, e esse atributo também muda a basculação e o entrosamento. Espelho sem instruções: abre 2 a 0 vence 94,7%, perde 0,4%, com 1,79 gols; a régua do 2 a 0 só vale depois de acertar os gols.

### As ideias medidas
- **Atrair conduzindo:** a versão testada não deu nada, mas ela não mede a ideia do dono (segurar a bola e conduzir para atrair a marcação e abrir espaço). Testei só um bônus no passe seguinte à condução ganha, contra pressão: ninguém passava a conduzir mais, nenhum marcador saía da zona dele e contra bloco baixo não valia. Com pressão 1 × 2, +6 em Drible não subiu com o bônus de 0,15 ou 0,3 (meio 0,055 → 0,062 → 0,023; defesa 0,031 → 0,017 → −0,003). Refazer com o marcador saindo da zona vizinha, por `arrasto`, e com a opção de conduzir valendo mais quando há marcador para atrair.
- **Posse longa arruma o time:** rende pouco, mas rende. Medida com posse ≥ 5 passes (contra × 0,75, retomada × 1,3) e ataque de ≤ 1 passe (contra × 1,3): o "pressionar ao perder" sobe de 1,465 para 1,549 pontos contra o misto; gols, gols de contra e PPDA não mudam. Medida numa configuração anterior à final, em cópia separada; não está no motor. Decisão do dono.
- **Goleiro como recomeço:** a grade não oferece. O goleiro fica fora das zonas, e a faixa 1 não tem passo para trás. Ele só toca na reposição: 3,7 tiros de meta e 2,9 reposições com a mão por time, ~6,6 toques, contra 17,4 passes certos por jogo no Brasileirão. TFA, Training Ground Guru e Hockey Training apoiam: dá superioridade de 4×3 contra a pressão.
  - **Aprovado pelo dono em 01/11, construído e fora do motor por enquanto.** Volta da faixa 1 para o goleiro pelo passo `voltar`, depois ele sai jogando. O jogo melhora: 4,5 voltas ao goleiro por jogo, 97% de acerto, volta 11,1%, posses de 10+ passes 8,2, bola longa 33%. Mas o valor quebra (+6 na linha, 1.000 jogos): com dificuldade 1,2, Decisões −0,056 e Passe −0,044 na defesa; com 0,6, tudo perto de zero; com peso 1,15 na nota, Decisões negativa em todas as linhas. Suspeita, não confirmada: a volta tem acerto alto e ganho falso na escolha, e cada ida ao goleiro gasta passos do limite por ataque, sem gastar relógio. Código guardado em `.superpowers/sdd/2026-10-31-grade-5x5/goleiro/` (o script do motor e o teste).

### Para os próximos passos
- Linha de fundo: quase todo cruzamento vem cedo, da faixa 4 (533 de 596 no teste dos papéis) e nenhum do Apoiador chega ao fundo. A frase dele mudou para "sobe pela lateral e cruza cedo". Peso de 1,3 na ida ao fundo não mudou nada.
- Sem instruções, o jogo dá 1,79 gols; a régua dá 2,41 com instruções sorteadas. Conferir antes de calibrar gols.
- Time que pressiona muito perde: pressão 2 × 0 dá 1,11 ponto. Passe curto × longo dá 1,61, desequilibrado. Os dois medidos numa configuração anterior à final.
- `sim_atributos_novos` roda sem pressão, então Decisões sob pressão não entra na tabela. Numa configuração anterior, com pressão 1 × 2, ela ficou ~0 do volante para a frente e +0,025 na defesa.
- `sim_valor_posicao` e `sim_papeis_laterais` não rodaram neste passo (Passo 4).

### Nota por posição
Excentricidade e Influência seguem com peso 0 em `PESOS_T1`. Recomendação: continuar assim. Excentricidade é risco, não qualidade, e a Influência só vale para o capitão.

### Frases novas da narração (para o dono ajustar)
- Drible folgado, Drible e Excentricidade altos: `dá uma caneta em X`, `aplica um chapéu em X`, `passa de elástico por X`.
- Drible alto: `corta X para dentro`, `tira X da jogada com um toque curto`.
- Velocidade alta: `deixa X na corrida`, `arranca e deixa X para trás`.
- Cara a cara, Excentricidade alta: `sai na cara do gol e tenta a cavadinha sobre G`, `sai na cara do gol e tenta de letra`.
- Apoiador: `sobe pela lateral e cruza cedo`.
