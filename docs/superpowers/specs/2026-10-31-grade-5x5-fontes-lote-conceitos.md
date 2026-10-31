# Grade 5×5: lote de conceitos (43 textos, 31/10/2026)

O dono avisou que tinha mais referências "com ideias e conceitos, não só valores". São os arquivos de `prototipos/` salvos depois do plano (commit d016641): 36 HTMLs do Total Football Analysis, 1 PDF repetido (o do Barcelona, mesmo texto do HTML) e 6 HTMLs do TheMastermindSite. Todos lidos por inteiro.

Resultado: **5 mecânicas novas ou corrigidas** (seção A), **metas novas de esforço** (seção B), o que só confirma o spec (seção C) e o que fica para outras etapas (seção D). O que entrou no spec e no plano está marcado lá como "lote de conceitos (31/10)".

## A. Mecânicas

### A1. A pressão encurrala no lado (a linha lateral é um defensor a mais)
- **Fontes (8):** Getafe de Bordalás (aperta quando a bola vai para o lado; o losango "fecha o meio e desaba no lado"), Como de Fàbregas (prende no lado com pressão alta, e é lá que faz mais faltas), Bayern × Real Madrid (fecha o meio, força o goleiro a sair pelo lateral e aperta no lado), pressão com losango ("a linha lateral como defensor extra"), marcação individual na pressão alta ("se a primeira onda for batida, empurre para o lado"), Aston Villa de Emery (bloco que força o jogo para fora), Chelsea de Alonso ("push, push" quando a bola vai para a linha lateral), St. Pauli de Blessin (força a saída pelo lado: caminho mais longo e sobrecarga mais fácil).
- **Proposta:** com a grade, o duelo num corredor de lado (`E`/`D`) contra quem pressiona leva um logit contra de `armadilhaLado × pressão` (partida 0,15). O lado ruim já vem de graça: quem desaba no lado deixa o lado oposto livre (A4) e a virada que escapa rende mais (Newcastle de Jaissle e o losango sofrem com a virada).

### A2. Atrair a pressão com a volta ("um passo atrás, dois à frente")
- **Fontes (7):** "The Benefits Of Negative Passing" (a volta tira o bloco do lugar e abre o espaço atrás de quem saiu; o Betis de Setién e o Barcelona de Pep), Liverpool 20/21 contra a pressão do Arsenal (rotação e passe ao homem livre), bloco baixo ("a volta atrai o bloco, desde que antes a bola tenha ido para a frente e alguém tenha apertado"), Brighton de Hürzeler (aperta em toda volta e em todo passe ao goleiro: é o risco), marcação individual na pressão alta (forçar a volta é o objetivo de quem pressiona), Getafe (aperta quem recebe de costas), "Press-resistant midfielders" (Caicedo atrai a pressão e passa por ela).
- **Proposta:** a volta ganha contra quem pressiona dá ao próximo passo para a frente um logit de `atrairPressao × pressão` (partida 0,12), zero contra mentalidade ≤ −1 (a retranca não sai). É o par do risco que já existe (a volta perde mais contra quem pressiona). Não soma com o terceiro homem, o embalo nem o "de frente": vale o maior (spec 12b).
- **Refinamento do terceiro homem (zona 14, dupla de volantes escalonada):** o toque de volta em **diagonal** (para o corredor vizinho) muda o ângulo e deixa quem recebe de frente; o reto vale menos (`terceiro.diagonal`, partida × 1,3 no bônus).

### A3. A ajuda ao centro vem da ameaça, não só da zona vazia (corrige o plano)
- **Fontes (6):** os dois textos de meio-campo em caixa (a sobrecarga central estreita a defesa e libera os lados), "Space Occupation & Creation" ("times de cruzamento sobrecarregam o centro para liberar o lado"), Wolves (8 por dentro, o adversário fecha e o ala fica livre), losango contra meio-campo de 4 (os meias abrem para cobrir o lado), Como em 4-1-4-1 (laterais fecham o meio).
- **O que estava errado:** a Tarefa 4 do plano só emprestava cobertura para a zona **vazia** (abaixo de 0,35 × a média da faixa). O motor de hoje (`ajudaAoCentro` 0,65) já fecha o centro com a defesa dos lados sempre que os lados não são ameaçados, mesmo com o centro ocupado. O plano perdia isso.
- **Proposta:** a zona pede ajuda quando está vazia **ou** quando o ataque nela passa de `ameaca` × a defesa (partida 1,3). Quem empresta continua sendo só quem não é ameaçado (prender o marcador). Com isso, o meio em caixa contra um time sem pontas abertos estreita a defesa; com pontas abertos, os laterais ficam presos.

### A4. A defesa bascula com um passo de atraso (virada rápida × pêndulo lento)
- **Fontes (7):** "Space Occupation" (sobrecarregar para isolar; a bola longa pelo alto é mais lenta, então a virada em dois toques curtos funciona melhor), bloco baixo (circular de um lado ao outro com ritmo e poucos toques; a virada longa num toque só é mais arriscada), City 25/26 contra o United (circular de lado e para trás sem progredir deixa o adversário se reorganizar), Martinelli/Arsenal (atrair de um lado e achar o ponta isolado do outro), Havertz (sobrecarga do lado da bola e virada rápida), Newcastle (defesa estreita sofre na virada), Schlotterbeck (diagonal rasteira que chega antes de o bloco bascular).
- **Proposta:** o duelo de cada passo usa a arrumação da defesa (seção 9.2) do corredor onde a bola **estava** no passo anterior, misturada com a do corredor atual por `basculacaoRapidez` (partida 0,5) × a qualidade da basculação de quem defende (Posicionamento e Trabalho em equipe da linha). A virada longa pega a defesa ainda arrumada para o outro lado; a virada em dois toques pega a defesa no meio do caminho; o pêndulo lento de 3 ou mais toques para o lado encontra a defesa já arrumada. O spec já dizia que o pêndulo lento não ganha nada; agora há uma conta que faz isso acontecer.

### A5. Ganhar com folga arrasta o cobridor
- **Fontes (7):** bloco baixo (quem recebe livre no espaço do 10 obriga o zagueiro a sair, e a bola vai nas costas dele), zona 14 (a dúvida entre o zagueiro sair e o volante descer), "Occupying Space Between Midfield And Defence" (quem está entre as linhas força uma decisão), Mitoma (o drible pelo lado puxa o zagueiro do meio-espaço para fora e o ponta corta por dentro, nas costas dele), Havertz (o lateral batido obriga o zagueiro a abrir e separa a dupla), Olise contra Carreras (o volante não pode largar o meio e a linha hesita), "Half-spaces like Pep" (puxar o defensor para fora da linha e atacar o espaço atrás dele).
- **Proposta:** usa os mesmos `buracos` da cobertura emprestada (seção 9.1), agora também por duelo:
  - duelo ganho com folga ≥ `arrasto.folga` na **zona 14** (`4C`) → o próximo passo em profundidade leva `buracos.profundidade` (o zagueiro saiu);
  - duelo ganho com folga num **lado das faixas 4–5** (o ponta bateu o lateral) → o meio-espaço vizinho (mesma faixa ou a de cima) perde `arrasto.lado` (partida 0,2) da defesa no passo seguinte (o zagueiro foi cobrir).

## B. Metas novas (de esforço)

| Meta | Valor | Fonte |
|---|---|---|
| Passes na jogada que termina em gol | média ~3,9 (12,5 s); time de transição ~2,5 (7,8 s) | Liga dos Campeões e Liverpool de Klopp (marcação individual na pressão alta) |
| Acerto de passe por posição | volante 90–96%; zagueiro construtor 89–91%; ponta driblador 73–85%; passe para a frente do meia de elite 80–88% | Witsel, De Jong, Caicedo, Schlotterbeck, Olise, Sarr, Díaz, Dembélé |
| Drible certo dos atacantes | 32–57% (duelo ofensivo ~37%) | Marmoush, Semenyo, Esposito, Rogers, Ndiaye |
| Enfiadas | ~2–6 por time por jogo, ~30% certas (o Barcelona de Flick, ponto fora da curva, ~10 por jogo em 24/25 e 7,4 com 32% em 26/27) | Opta, Coaches' Voice |
| xG por chute | média da liga 0,11–0,12; o melhor ataque ~0,19 (teto) | Opta (modelo novo de xG), Barcelona 26/27 |
| Chutes no alvo | 37–54% | United de Carrick, Marmoush, Esposito, Semenyo |
| PPDA sofrido | 10–15 (o mais pressionado ~10, o menos ~15) | Premier League 25/26 |
| Roubadas no terço final | o time que mais pressiona ~7 por jogo | Brighton de Hürzeler |
| Chutes por jogo | time de volume ~15 (37,6% no alvo); time eficiente ~11,7 com 1,42 de xG | United, Villa 25/26 |

Confirmam metas que já estavam no spec: PPDA de quem pressiona 5–9 (Zorya 5,3; Getafe 7,1–9,5; Bayern 7,5; Real Madrid 8,8); 5-3-2 sofre cruzamento e defende bem no alto; o losango é forte por dentro e fraco no lado e na virada.

## C. Só confirmam o spec (sem mudança)

- O meio-espaço não é lugar mágico: vale pelos ângulos e pelo que arrasta (Half-spaces like Pep, zona 14). Confirma "sem bônus de lugar" (seção 8).
- Diagonal curta do meio-espaço mais fácil (distância menor, menos gente no caminho) e chegar na zona 14 em diagonal melhor que parado nela (zona 14, entrelinhas). Seção 7.2.
- O volante cobre a linha de defesa antes do zagueiro e do lateral (Witsel, Como, Newcastle). Ordem da seção 9.1.
- Só empresta quem não está ameaçado (Tchouaméni preso no meio contra o Bayern). Seção 9.1.
- Terceiro homem e tabelas maiores contra marcação individual (Inter × Roma, Havertz × Lille, dupla de volantes escalonada). Seção 7.6.
- Defesa de transição relativa ao adversário (rest-defense do Arsenal, Brighton e City: quantos ficam depende de quantos o adversário deixa na frente). O R1 de hoje já é `(saída do adversário + 1) / reserva`.
- Contrapressão melhor com o time perto da bola (losango do Getafe, entrelinhas, City de Maresca); a perda no meio é a pior (dupla 6+8). Seção 10.
- Bola longa forçada pela pressão vira duelo aéreo e segunda bola para quem é compacto (St. Pauli, Getafe, Bayern × Schalke, Aravaca). Seção 7.7.
- Cruzamento da linha de fundo e cut-back pelo lado da faixa 5 (Olise, Wimbledon com ala). Seção 8.
- Atacante no meio-espaço sai livre contra linha alta no contra-ataque (Hakimi → Hazard). Seção 10.

## D. Para outras etapas (estacionado)

- **Etapa "Atacantes, pontas e zagueiros":** ponta por dentro e ponta flutuante (Sarr, Díaz, Dembélé, Zaccagni, Kvaratskhelia, Semenyo), falso 9 que recua e arrasta o zagueiro (Havertz, Benzema, Rodrygo), dupla de atacantes referência + profundidade (Itália), volante que recua entre os zagueiros (saída Lavolpiana; Liverpool, Roma, Bayern, Newcastle), dupla de volantes escalonada, zagueiro condutor e construtor (Schlotterbeck, Guéhi), 4-4-2 assimétrico (um meia aberto sobe, o outro fecha: Atlético, Getafe).
- **Ideia "defesa no escanteio/cruzamento" (já estacionada):** zona, mista e individual na área (Lecce, Aston Villa, Freiburg, Rayo).
- **R1 pela qualidade de quem fica:** zagueiro forte no 1 contra 1 deixa o time atacar com menos gente atrás (Arsenal). Hoje o R1 conta só o peso.
- **Jogador improvisado leva a mancha da posição de origem** (Gerard Martín, lateral jogando de zagueiro, puxado para o lado).
- Goleiro como homem a mais na saída (4 contra 3), lateral especialista em arremesso longo, tiro de meta longo do time direto (Aravaca: 4 de cada 5).
- Placar mudando o bloco (o Bayern recua com a vantagem e perde o domínio).
- Movimentação sem a bola (Bielsa, Haaland, entrelinhas dinâmica × fixa): atributo Movimentação, na caixinha.

## E. Último lote (11 textos, 31/10)

Coaches' Voice (virada de jogo; Barcelona de Flick), Opta Analyst (xG novo, notas de jogador, ranking de força), Between The Posts (Independiente × Boca), Running The Show (Empoli de Andreazzoli), Breaking The Lines (Morgan Rogers; ganhos marginais), The False 9 (marcação por zona no escanteio), Barcelona × Real Madrid de Mourinho. Todos lidos por inteiro. **Nenhuma mecânica nova**; ajustes só em metas (seção B: enfiadas, xG por chute, drible).

- **Confirma A4:** "atrair antes de atacar" (a virada sem antes puxar o adversário dá tempo para a defesa bascular), virada dupla de lateral a lateral com no máximo dois toques, a bola tem que chegar rápida e no pé de trás, o ponta do lado fraco precisa ficar lá (Coaches' Voice). O Empoli defende só em volta da bola e ignora quem está longe; o jogador aberto e isolado é mais fácil de defender, porque a defesa corre enquanto a bola viaja.
- **Confirma A2:** o Empoli atrai a pressão com os laterais baixos para receber atrás dela, e o up-back-through do losango escalonado sai em diagonal.
- **Confirma a seção 10:** interceptar dá um contra mais limpo que desarmar (o Empoli prefere interceptar); o Real de Mourinho com 38% de posse teve 5 contra-ataques contra 2, chutou 10 contra 18 e ganhou com a linha alta do Barcelona.
- **Confirma a meta de gols depois dos 75':** pernas cansadas, bloco menos compacto, jogo aberto (Independiente × Boca). O motor já tira eficácia pela energia.
- **Metas:** PPDA de quem pressiona 7,7 (Barcelona de Flick); Rodri 91% de acerto sendo o jogador mais pressionado da liga; chutes no alvo de centroavante ~49% (Lewandowski); gols de bola parada ~0,65 por jogo na Premier League daquela temporada.
- **Estacionado:**
  - notas de jogador por posição em escore padronizado, com 6 partes (chute, passe, posse, defesa, ataque, goleiro), e "adversários ultrapassados pelo passe" como crédito ao construtor: para a memória `rever-notas-jogadores`;
  - força dos times por Elo com 80% do placar e 20% do xG: ideia para ranking de clubes, fora da grade;
  - marcação por zona × individual no escanteio: para a ideia "defesa no escanteio", já estacionada.
