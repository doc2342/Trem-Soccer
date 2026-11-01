# Fontes de Decisões (lote salvo pelo dono em 01/11/2026)

10 arquivos em `prototipos/`, lidos por inteiro. Parte é texto de academia ou de opinião, sem medição: serve para a ideia, não para número.

| Fonte | Tipo | O que trouxe |
|---|---|---|
| How Do Football Players Make Smart Decisions Under Pressure (IQ Football, 2026) | academia | tempo, espaço e escolha; sob pressão escolhe-se o mais seguro |
| Data on Decision-Making (SwitchedOn, resume Teoldo et al., 2023) | **estudo** | volume e velocidade: profissional × base |
| How to Improve Soccer Decision Making (Soccer Field Academy, 2026) | academia | risco por zona; decisão por posição |
| What Is The Hardest Position (Alicante Football Academy, 2026) | academia + FIFA/UEFA | placar de velocidade de decisão por posição |
| What is the Hardest Position (Jobs In Football) | opinião | dificuldade tática por posição |
| What's the Most Important Position (Bayern, EUA) | academia | posição crítica por formação; Raumdeuter |
| Defense in football: how to improve positioning (SIA Academy) | academia | posicionamento × decisão na defesa |
| The 10 tactical mistakes (SIA Academy) | academia | leitura do jogo, pressão coordenada |
| Mental Skills in Soccer 2026 (Storelli) | loja | lista de habilidades mentais |
| Ranking the 10 Players… Mental Game (Bleacher Report, 2014) | opinião | Pirlo, Iniesta, Xavi: rapidez de pensamento |

## Números

- **Teoldo et al. (2023):** 12 jogos e 138 jogadores. Profissional ~2.460 decisões por jogo, base ~1.573 (+56%); ~41 por minuto. Tempo por decisão no teste TacticUP: com a bola 7,08 s × 10,51 s; sem a bola no ataque 6,29 s × 8,94 s; na defesa 6,37 s × 8,84 s (30–40% mais rápido). Decisão se treina.
- **Alicante, velocidade de decisão (1–5, avaliação da academia):** volante 5, meia central 5, goleiro 4, lateral 4, ponta 4, zagueiro 3, atacante 3. Custo do erro: goleiro 5, volante 4, zagueiro 4, lateral 3, meia 3, atacante 3, ponta 2.
- **FIFA (Copa, citado pela Alicante):** zagueiros e volantes fazem 70–85% da alta intensidade sem a bola.
- **UEFA, EURO 2024 (idem):** meia central 10.924 m, lateral 10.209 m; acima de 25 km/h, lateral ~166 m × meia ~96 m. Para a revisão de energia, não para este plano.
- **Jobs In Football, dificuldade tática (opinião):** meia e volante Muito alta; goleiro, zagueiro e lateral Alta; atacante e ponta Média.

## Fonte pede × nosso plano × resultado

| A fonte pede | Hoje no plano | Resultado |
|---|---|---|
| Sob pressão o jogador cai no mais seguro ou força; calmo, decide melhor (IQ, Storelli, Alicante, Bleacher) | Decisões só pesava na escolha, sem pressão | **Muda:** a pressão do adversário tira Decisões de quem decide mal, pouco de quem decide bem |
| Isso é a Compostura? | Compostura ficou de fora | **Confirma:** a queda sob pressão cobre, sem atributo novo |
| Arriscar no campo de ataque, não na frente da própria área (Soccer Field) | `valorDe` já desconta `(1 − p) × risco × xT` da zona inversa | Já coberto |
| Reciclar quando não há espaço | `reciclar` da Tarefa 9 | Já coberto |
| Defender é decidir: dar o bote, atrasar ou recuar (Alicante, SIA, Soccer Field) | zagueiro tinha peso em Decisões, mas ela só valia com a bola | **Muda:** Decisões entra na defesa, ¼ da parte do Posicionamento, só na grade |
| Goleiro decide rápido e sob pressão (Alicante 4; Jobs, tática Alta) | média 23,8 e sem efeito nenhum | **Muda:** média sobe para 25,9; Decisões entra na saída do gol |
| Volante é o que mais decide; erro dele vira contra-ataque pelo meio (Alicante, Jobs) | peso 10 contra 12 do meia | **Muda:** peso 12, 2 pontos vindos do Posicionamento |
| Zagueiro abaixo dos meias (Alicante 3) | 31,6, perto dos meias (The Athletic, scanning) | Mantido: a ordem do scanning é medição; a nota da Alicante é avaliação |
| Atacante decide menos (Alicante 3, Jobs Média) | FC 23,8, SC 20,0 | Confirma |
| Base decide pior que profissional (Teoldo) | termo de idade, 0,3 por ano | Confirma |
| Decisão se separa da execução: a cabeça vê, o corpo precisa fazer (Soccer Field) | escolha pela Decisão, duelo pelo Passe | Confirma |
| Raumdeuter: inteligência e movimentação valem como técnica (Bayern) | AMC e FC com `mov` | Confirma |
| Decisão melhora com repetição de jogo | sem regra | Fica para a revisão do treino, depois dos papéis |
| Foco, concentração e confiança | moral e experiência | Fora: confirma a memória `atributos-caixinha` |
| Treino por posição, não genérico (Storelli, Soccer Field) | etapa Treino por papel | Reforça a etapa, depois dos papéis |

# Segundo lote (01/11): FotMob, idade e movimentação

## FotMob, por posição (jogadores com 900+ minutos)

Baixado de `data.fotmob.com/stats/{liga}/season/{id}/{stat}.json`. Premier 2025/26 (id 27110) e Brasileirão 2025 (liga 268, id 25077). Médias simples por jogador, por 90 minutos. O site lista 46 estatísticas por jogador. Posição = a primeira do FotMob, agrupada por mim. O FotMob não lista bola longa de goleiro, e no Brasileirão bloqueia os dados físicos. "Passes que quebram linha" do Brasileirão estão numa escala bem menor que a da Premier: não comparar entre ligas.

| Grupo | Bolas longas certas P / B | Acerto P / B | Tentadas P / B | Passes certos P / B | Quebra linha (P) | Sprints (P) | Distância km (P) | Interceptações P / B | Recuperações P / B |
|---|---|---|---|---|---|---|---|---|---|
| Goleiro | sem dado | sem dado | sem dado | 21,1 / 17,4 | sem dado | 0,2 | 5,4 | 0,0 / 0,0 | 8,3 / 7,2 |
| Zagueiro | 2,3 / 3,0 | 43% / 49% | 5,4 / 6,0 | 45,7 / 44,9 | 10,1 | 7,4 | 10,2 | 1,1 / 1,0 | 3,4 / 3,4 |
| Lateral | 1,4 / 1,6 | 39% / 44% | 3,5 / 3,5 | 33,1 / 32,5 | 9,7 | 13,6 | 10,7 | 1,0 / 1,0 | 4,1 / 4,0 |
| Volante ou meia recuado | 2,0 / 2,6 | 52% / 63% | 3,8 / 4,1 | 42,5 / 42,6 | 10,4 | 8,5 | 11,4 | 1,1 / 0,9 | 4,8 / 4,6 |
| Meia (poucos: 8 / 6) | 1,5 / 2,1 | 57% / 63% | 2,7 / 3,4 | 34,5 / 35,7 | 8,9 | 8,7 | 11,5 | 0,8 / 0,9 | 4,6 / 5,2 |
| Meia-atacante | 1,3 / 1,8 | 52% / 61% | 2,5 / 3,0 | 30,4 / 32,0 | 7,6 | 11,9 | 11,5 | 0,6 / 0,4 | 4,2 / 4,0 |
| Ponta | 0,7 / 1,0 | 51% / 57% | 1,4 / 1,7 | 22,9 / 23,1 | 4,8 | 14,8 | 10,6 | 0,5 / 0,6 | 3,9 / 3,8 |
| Atacante | 0,3 / 0,6 | 51% / 57% | 0,6 / 1,0 | 11,9 / 14,2 | 2,2 | 12,8 | 10,6 | 0,3 / 0,3 | 2,3 / 2,3 |

Topo de bolas longas certas: Premier, Rodri 5,4 (69%), Andersen 5,2, Senesi 5,0, Xhaka 4,3; Brasileirão, Fuchs 6,0 (64%), Scarpa 5,9 (69%), Marlon Freitas 5,8 (72%).

O acerto de ponta e atacante vem de poucas tentativas, provavelmente as mais fáceis: não leva a Passe longo alto.

## Fonte pede × plano × resultado

| Dado | No plano | Resultado |
|---|---|---|
| Zagueiro é quem mais tenta e mais acerta em volume; acerto baixo, talvez por lançar mais e sob pressão (hipótese minha) | Passe longo 26,8, peso 3 | **Muda:** 28,5, peso 5 (1 do Posicionamento, 1 da Comunicação) |
| Lateral é quem menos acerta | 25,9, quase igual ao zagueiro | **Muda:** ajuste −7 → −8; 25,7 |
| Volante e meia lideram em acerto, com volume | 33,4 e 33,8 | Confirma |
| Ponta e atacante quase não lançam | 25,5 e 18,6–23,6 | Confirma |
| Sprints: ponta > lateral > atacante > meia-atacante > meia = volante > zagueiro | lateral 26,4 | **Muda:** ajuste −6 → −4; 27,9. Sprint inclui correr para trás, então não é medida pura de Movimentação |
| Bernardo Silva: menor velocidade máxima da liga (29,4 km/h) e entre os que mais correm; Souček sempre "procurando espaço"; Cunha é quem mais anda e fez 13 gols (Opta) | Movimentação separada da Velocidade | Confirma |
| Interceptações: zagueiro = volante = lateral > meia > meia-atacante > ponta > atacante | Decisões na defesa | Confirma |
| Acima de 30 anos, 3–5% a mais de acerto de passe; sprints −21%, corridas rápidas −12%, distância −3,4% (Barça, Bundesliga e La Liga) | sem idade no Passe longo | **Muda:** +0,15 por ano |
| Erro de passe cai 4 cm por ano dos 12 aos 16 (45 → 30 cm; PMC, 46 jogadores) | idem | Confirma o termo de idade |
| Pico físico ~24–26 anos, queda forte acima de 32, resistência sem mudança (Série A, 99 jogadores, 5.203 casos) | queda física a partir dos 31 | Confirma. A queda de Resistência na virada fica para revisar depois |
| Idade reduz ansiedade; atacante mais ansioso que goleiro (Frontiers, Índia, 83 jovens) | Decisões com idade; atacante baixo | Confirma, amostra pequena |
| Tempo da corrida na tabela e no passe no espaço: sair quando o zagueiro olha a bola (England Football) | `chegada` | Confirma |

Combinações da England Football (tabela, overlap, up-back-through = terceiro homem, lending pass = atrair e virar) já existem na grade; a **takeover** (trocar a bola em condução) não existe, sem proposta agora. Saídas do goleiro (bloqueio, abafar, espalmar) servem para a narração da Tarefa 11b.

Sem uso: matriz de prioridades (é para técnico organizar tarefas); Opta Definitions só serve de glossário da régua; Science for Sport (maturação até 15 anos), porque a base começa aos 16.

**Leitura:** os 3 estudos longos (Aging Curve, cognitivo-motor, Frontiers) li pelo resumo, resultados e conclusões; métodos e referências não. FotMob e os demais, por inteiro.
