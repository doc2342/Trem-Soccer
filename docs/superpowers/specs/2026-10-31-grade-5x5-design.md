# Grade 5×5 do motor: design

Aprovado com o dono em 30–31/10/2026, em duas sessões de brainstorming. As decisões estão na memória `grade-5x5` e os achados das fontes estão nos 7 documentos `docs/superpowers/specs/2026-10-3*-grade-5x5-fontes-*.md`. Esse resumo é o que o construtor precisa; as fontes trazem o porquê de cada número.

## 1. Intenção

Trocar as 9 zonas do motor (3 corredores × 3 linhas, `ZONAS` em `src/motor.js`) por **25 zonas (5 × 5)**, só nas regras da T1, **antes da etapa "Atacantes, pontas e zagueiros"** do plano dos papéis e antes da virada T0→T1 (fim de novembro de 2026).

Por quê:
- com 9 zonas, o ala "na linha dos volantes" vira alguns pontos de % trocados entre D e M;
- não existe meio-espaço, e é nele que vão viver os próximos papéis (ponta invertido, meia entre as linhas, falso 9, lateral invertido);
- fazer os papéis dos atacantes em 9 zonas e trocar a grade depois seria trabalho dobrado.

O critério de desempate de todas as decisões, definido pelo dono, é **"o mais fiel ao futebol real"**.

## 2. Objetivos, não objetivos e antiobjetivos

**Objetivos**
- A jogada passa a percorrer uma grade de faixas por posição × corredores, com caminho livre (de 2 a 5 etapas, para a frente, para o lado, para trás, pulando faixa).
- O meio-espaço existe e vale pelo que abre (diagonais, menos perda de bola), não por estar lá.
- As regras da T1 (compactação, lotação, reserva/contra-ataque, pressão, recompor) funcionam na grade nova.
- O motor bate as metas de calibragem da seção 11 (números de ligas reais).
- Os 4 papéis dos laterais/alas são convertidos mantendo o sentido de cada um.

**Não objetivos (desta etapa)**
- Papéis novos de atacantes, pontas, meias e zagueiros: vêm na etapa seguinte, já na grade.
- Atributos novos: Decisões, Movimentação, Antecipação, Equilíbrio e Altura continuam na caixinha (memória `atributos-caixinha`).
- Revisão das notas dos jogadores, xP e xGP no relatório e linha da pressão por minuto: ficam como ideias (seção 13).
- Instrução nova de ritmo; instrução "forçar para fora/dentro" (item 3 do pacote tático, marcada para depois da grade).

**Antiobjetivos (seria um fracasso mesmo funcionando)**
- Mexer em qualquer partida da T0 ou quebrar a reprodução (replay, ao vivo, relatório) de jogos já disputados.
- Introduzir `Math.random()` em caminho do motor (tudo pelo `rng` com semente).
- Meio-espaço como "bônus de lugar" que vira a rota óbvia; virada longa frequente; jogadas em loop infinito de passes para trás.
- Liga com gols, posse ou valor das posições fora das metas, ou time grande sem conseguir furar bloco baixo.

## 3. Restrições

- **Só regras da T1.** `simularPartida(..., { regrasT1: true })` (o padrão; `calcularPartida` liga a partir de `PAPEIS_DESDE`). Com `regrasT1: false`, o motor de hoje com 9 zonas segue igual, **para sempre**, porque os jogos da T0 são reproduzidos no navegador com a mesma semente.
- **Determinismo:** mesma semente, mesmo jogo, no servidor (função `rodada`) e no navegador (`aovivo.html`, relatório).
- **Empacotamento:** `supabase/functions/rodada/index.ts` é gerado por `ferramentas/empacotar_funcao.py` a partir de `MODULOS`. Módulo novo precisa entrar na lista, com `import { … } from "./x.js";` em uma linha e um `export` por declaração (ver CLAUDE.md). Rodar o empacotador e republicar a função faz parte da entrega.
- **Amistosos** (aba Amistoso) já rodam as regras da T1 antes da virada: a grade nova aparece lá primeiro.
- O bot (`avaliarZonas`, `src/bot.js`), as telas (`ui-escalacao.js`, `ui-trem.js`, `ui-relatorio.js`), o analista (`src/relatorio.js`) e `jogo.html`/`aovivo.html`/`partida.html` leem as 9 zonas hoje; na T1 precisam ler a grade nova e, na T0, continuar com a antiga.

## 4. Abordagens consideradas

| | Abordagem | Troca | Decisão |
|---|---|---|---|
| A | **3 fases de hoje (saída, meio, ataque) espalhadas pelas 5 faixas** | Muda pouco o ritmo de gols; a faixa dos volantes e a do 10 não têm duelo próprio | Descartada |
| B | **5 duelos fixos, sempre faixa a faixa** | Cada faixa com seu confronto espelhado, mas a bola longa, o contra-ataque e a volta não cabem; ritmo de gols do zero | Descartada |
| C | **Caminho livre:** cada passo vai para uma zona escolhida (para a frente, para o lado, para trás, pulando faixa), e o duelo é na zona de destino contra a espelhada | Mais fiel (é um processo de Markov como o xT); exige calibrar o número de passos e o freio das voltas | **Escolhida pelo dono** ("pode passar por 3, por 4 ou por 5, pode ir para frente e voltar, … da defesa direto para o ataque na bola longa") |

## 5. A grade

- **Faixas (linhas), da própria meta para a do adversário:** 1 zagueiros/laterais (DC, DR, DL, SW) · 2 volantes/alas (DMC, WBR, WBL) · 3 meias (MC, MR, ML) · 4 meia ofensivo/ponta (AMC, AMR, AML) · 5 atacantes (FC, SC, RW, LW). Cada posição mora numa faixa (5 é ímpar: o confronto espelhado fecha).
- **Corredores (colunas):** lado · **meio-espaço** · centro · meio-espaço · lado. O nome é **"meio-espaço"** (decisão do dono; nunca "meia-lua"). Larguras reais (~14 / 11 / 18 / 11 / 14 m) só no desenho.
- **Espelho:** a faixa k de quem ataca enfrenta a faixa 6−k de quem defende, e o corredor troca de lado (o lado esquerdo de um é o direito do outro). Confrontos naturais: atacante × zagueiro, meia ofensivo × volante, meia × meia, ponta × lateral, meia aberto/ala × ala.
- **Nomes para o analista e a narração:** "zona 14" = centro da faixa 4 do adversário; "meio-espaço direito na faixa do meia ofensivo"; "fundo pela esquerda" = lado da faixa 5 etc.

## 6. Cobertura (as "manchas")

- **Rascunho aprovado:** `.superpowers/brainstorm/29-1793397721/content/manchas-v2.html` (20 variantes de posição × com/sem a bola, e 6 formações somadas). Os números são de partida e a calibragem pode ajustar.
- **Posições repetidas por contagem**, para qualquer formação montada à mão:
  - 1 jogador fica no centro;
  - 2 ficam um em cada meio-espaço (dupla de zaga, duplo pivô, dupla de ataque);
  - 3 ficam meio-espaço/centro/meio-espaço (o zagueiro de lado do trio já aprovado).

  A caixa do Pep (2 AMC) e a árvore de Natal caem sozinhas nos meios-espaços.
- **Mapas com e sem a bola também para os zagueiros** (e duplas de volantes e atacantes): sem a bola fecham para o centro, com a bola abrem para os meios-espaços. Somados, o centro da faixa 1 fica com ~0,70 sem a bola. O ponto fraco real é o "canal" zagueiro–lateral, no meio-espaço.
- **Os 4 papéis dos laterais/alas** (aprovados em 31/10), convertidos mantendo o sentido:
  - **Fixo:** atrás, no lado da faixa 1;
  - **Apoiador:** sobe pelo lado até a faixa 4–5; com ponta aberto (RW/MR) na frente, a passagem vai pelo meio-espaço;
  - **Construtor:** na faixa 2, entre o lado e o meio-espaço;
  - **Invertido:** entra no meio-espaço da faixa 2 com a bola e volta para o lado sem ela;
  - **ala:** ganha a faixa 2 de verdade.

  Conferência: os outros papéis perto do padrão em pontos por jogo (`ferramentas/sim_papeis_laterais.mjs`) e o campinho dos papéis (`prototipos/papel_campinho.html`) redesenhado na grade.

## 7. A jogada: caminho livre

Cada ataque é uma sequência de **passos**. Em cada passo, quem tem a bola escolhe o destino. O passo é um **duelo na zona de destino** (nossa força ali contra a defesa espelhada do adversário), com a dificuldade do tipo de passo. A jogada termina em chute, perda da bola, falta ou no limite de segurança.

### 7.1 Tipos de passo e dificuldade
- Escada de dificuldade:
  - **voltar** (uma faixa para trás): o mais fácil, mas tem risco;
  - **lado** (mesma faixa, coluna vizinha);
  - **subir uma faixa**;
  - **pular faixa** (duas ou mais, por baixo quebrando linha ou pelo alto);
  - **virada** (do lado para o lado oposto, ou de meio-espaço a meio-espaço oposto).
- **Metas de acerto por tipo:** voltar/lado ~95%, subir uma faixa ~84%, pular faixa ou último passe ~50%; geral 82–84% (artigo da PMC; xP da Driblab 0,92 / 0,26 / 0,78).
- **O Passe pesa mais nos passos médios e difíceis.** O passador de elite rende ~5–7 pontos acima do esperado no mesmo passe.
- **A dificuldade depende da coluna de origem:**
  - do meio-espaço, as diagonais ficam mais fáceis;
  - do lado, o passe para dentro é mais interceptado e o reto pela lateral é uma armadilha: quem recebe fica de costas, apertado, e tende a devolver ou perder (Tuchel);
  - o passe que atravessa uma faixa sofre também a marcação dela (a bola longa contra bloco compacto fica difícil sem regra especial).
- **Acerto cai perto do gol:** ~85–87% no meio-campo central, 32–49% perto da linha de fundo (CxT).
- **Condução:** um passo pode ser feito com a bola no pé (Drible, Velocidade, Domínio), por exemplo o zagueiro avançando da faixa 1 para a 2 ou a condução em diagonal.

### 7.2 Diagonal (decisão do dono)
- O passo natural é a **diagonal curta**: subir uma faixa indo para a coluna vizinha (lado→meio-espaço, meio-espaço→centro). Ela **substitui** o `continuidade` 1,3 de hoje (que favorece seguir no mesmo corredor).
- **A diagonal que sai do meio-espaço é a mais valiosa:** quem recebe fica de frente e ganha bônus no duelo seguinte. Centro→lado pesa menos e não ganha o bônus. A diagonal fura os gatilhos de pressão.
- O bônus da diagonal pede alguém nosso na coluna vizinha da faixa seguinte (estrutura escalonada).
- **Metas (matriz de transição do Karun, PL 2017/18):** do meio-espaço, a diagonal para a frente (17–18% dos movimentos) é ~2× o passe reto (8–9%); do lado, o reto é mais comum (15% contra 7%); do centro, os dois ficam parecidos.

### 7.3 Inversão e virada (decisão do dono)
- Um passo pode mudar de faixa e de coluna ao mesmo tempo (o LE achando o ponta direito duas faixas acima). A dificuldade cresce com a distância somada.
- A recompensa é o **lado fraco esvaziado pela basculação** (seção 9.2): quem recebe disputa contra a defesa daquele lado já esvaziada.
- Usa o passe longo de quem lança. As instruções "passe longo" e "lados" deixam a virada mais frequente, e "curto" a deixa mais rara.
- **Metas:** virada lado→lado em ~1% dos movimentos, com ~40–42% de acerto e ~15–17% de resultado bom. A melhor virada é de meio-espaço a meio-espaço.
- O "pêndulo" lento de um lado ao outro não ganha nada contra a defesa que bascula bem.

### 7.4 Voltar e o freio das voltas
- Recuar tem risco, menor que avançar (decisão do dono).
- **Quem equilibra quantas voltas acontecem é a pressão do adversário** (decisão do dono): cada toque para trás diante de quem pressiona é mais uma chance de perder a bola. Contra quem não pressiona, dá para circular mais tempo.
- **Existe um limite de passos por jogada, só como rede de segurança** (quase nunca atingido; o construtor escolhe o valor).
- **Dividir o marcador:** a pressão sobre quem tem a bola pesa menos quando o time tem peso nas duas zonas vizinhas do receptor (saída dos dois lados).
- A volta que prepara o passe para a frente tem valor (nos gols analisados, sai de primeira).
- **Metas:** a volta é 12–13% dos movimentos que saem do centro e ~22% dos que saem do lado; 11–16 posses de 10 passes ou mais por jogo.

### 7.5 Quem decide o passo: Decisão
- **Quem decide é o jogador com a bola.** O sorteio pesa as opções (força no destino contra a marcação, lado fraco esvaziado, espaço nas costas, instruções). O bom decisor fica perto da **melhor** opção; o mau decisor fica perto da **média** (é a régua média contra máximo do xT contra o Bellman).
- **Decisão = Criatividade + Trabalho em equipe, numa função só** (se um dia o atributo Decisões for criado, muda uma linha). Aprovado pelo dono: "mantém assim por enquanto".
- "Olhe o mais longe possível; se o passe está aberto, dê; senão, circule": o bom decisor escolhe o passo mais adiantado que está aberto.
- **A vontade de pular faixa cresce com a pressão e a linha alta do adversário** ("jogar onde está o espaço"; "se o lateral deles sobe, bola nas costas").
- **A folga do duelo decide o próximo passo:** ganhar apertado → tende a devolver ou tocar para o lado; ganhar com folga → gira e avança. Depois de um passe vertical pelo centro, quem recebe fica de costas e tende a devolver.

### 7.6 Terceiro homem
- **Bônus de terceiro homem:** quando um passo para a frente é ganho apertado e o seguinte é um toque curto de volta, o próximo passo para a frente enfrenta **marcação enfraquecida** (o defensor foi atraído, pela mesma conta da cobertura emprestada) e quem recebe fica **de frente** (bônus no duelo seguinte). É a "tabela" aprovada em 29/10 no plano dos papéis.
- Só vale com peso nosso na zona do terceiro homem. Cresce contra quem pressiona ou marca homem a homem; quase some contra a retranca que não sai.
- O entrosamento do setor aumenta o bônus (é a superioridade "dinâmica").
- **O lado ruim:** o toque de volta é disputado contra a pressão e o Desarme/Agressividade de quem marca na zona. Se for roubado, o adversário sai em contra-ataque contra a defesa desarrumada, com chance maior que numa perda comum ali.
- **Metas:** terceiro homem que chega ao terço final ~0,4 por jogo em média e 1–2 nos times que mais fazem (é um piso); tabela com avanço ~4 por jogo, com laterais à frente.

### 7.7 Bola longa, duelo aéreo e segunda bola
- **1º toque:** duelo aéreo na zona de destino, pelo pacote aéreo já aprovado (ganhar = Posicionamento + Força + Altura; qualidade = Cabeceio; Altura é característica fixa).
- **2º toque (segunda bola):** sorteado pela **presença de cada time na zona de queda e nas vizinhas** (compactação e gente perto), com ~30% de acaso, seja quem for que ganhou o 1º toque. Quem ganha segue a jogada dali; se for o adversário, ele recomeça ali, com contra-ataque se nosso time ficou esticado.
- A bola longa mira as colunas 2–4 da faixa 5 (o 9 ou o meio-espaço), com o duelo contra o zagueiro daquela coluna. A bola longa saindo do zagueiro pelo lado progride menos.
- **Metas:**
  - quem lança fica com a bola em ~25% das vezes (com boa estrutura, até 40–50%);
  - cada time fica com a segunda bola em 26–36% dos duelos aéreos;
  - ~26 duelos aéreos por time por jogo;
  - quem disputa mais no alto ganha proporcionalmente menos;
  - bola longa em ~10% dos passes da liga (time direto ~11% ou mais).

## 8. Fim da jogada: chances por zona

- **Por coluna:**
  - **centro:** chute de área, bola em profundidade e chute de longe;
  - **meio-espaço:** chute colocado (`corte`, pé invertido ajuda), passe para trás/cut-back e enfiada;
  - **lado:** cruzamento.

  O chute direto do meio-espaço é raro (sai a assistência).
- **Cruzamento antecipado** sai do lado da **faixa 4** e rende mais no contra-ataque e contra linha alta. **Cruzamento da linha de fundo e cut-back** saem do lado da **faixa 5** e rendem mais contra bloco baixo (a zaga recua e libera a marca do pênalti). "O fundo aberto" quase não dá assistência.
- **Ajuste do pé pela coluna da ação**, não pela posição: no meio-espaço o pé invertido ajuda; no lado o pé natural cruza.
- **Valor da zona** (xT da 5×5, chance de gol nas próximas ações): faixa 1 0,009 → 2 0,017 → 3 0,032 → 4 0,075 → 5 lado 0,13 / meio-espaço 0,15 / centro 0,22 (pequena área 0,38–0,42). É plano na largura até a área: **sem bônus de lugar para o meio-espaço**. Meta: a chance de gol da jogada a partir de cada zona segue essa proporção entre faixas.
- **Onde se chuta:** o centro da faixa 5 chuta em ~77% das posses, o meio-espaço da faixa 5 em ~13%, o lado em ~0% (cruza), a zona 14 em ~28%. Chutes de jogo corrido quase todos de dentro da área; ~50% no centro.

## 9. Defesa

### 9.1 Zona vazia: cobertura emprestada (decisão do dono)
- A zona sem marcador recebe ajuda dos vizinhos, **emprestada**: o peso sai da zona de quem ajuda (o total do time não muda), como a basculação de hoje.
- A ordem é **volante → zagueiro → lateral**, e cada um deixa o seu buraco: o zagueiro que sai abre a área e a profundidade (a próxima bola em profundidade ganha bônus); o lateral que sai abre o lado (mais cruzamento).
- **Só empresta quem não está ameaçado na própria zona** (o `ajudaAoCentro` de hoje vira regra geral; é o "prender o marcador": o 9 prende os zagueiros e o ponta aberto prende o lateral).
- A qualidade da cobertura vem do Posicionamento.

### 9.2 Cinco arrumações, em três corredores
- A defesa tem **uma arrumação por coluna da bola** (hoje `defLado` E/C/D).
- **Regra dos três corredores:** o bloco ocupa 3 dos 5 corredores.
  - Bola no centro: centro e os dois meios-espaços.
  - Bola no lado: lado, meio-espaço vizinho e centro.
  - Bola no meio-espaço ("zona cinza"): aquele meio-espaço, o centro e o lado vizinho, com **um peso pequeno que fica no meio-espaço oposto**.

  Os 2 corredores livres são o lado fraco da virada, e empurrar o jogo para fora aumenta o número de cruzamentos.

### 9.3 Regras da T1 na grade (aprovadas em 30/10)
- **Compactação entre cada par de faixas vizinhas:** a faixa adiantada sem cobertura atrás não segura e abre o bolsão entre elas. Referência real: 10–15 m entre linhas quando o time encurta o campo.
- **Lotação por coluna:** o lado lota antes; o meio-espaço e o centro aguentam mais gente. O limite é recalibrado (zonas menores).
- **Pressão:**
  - meta de PPDA de 5–8 com pressão 2 e 15–20 com pressão 0;
  - a pressão custa caro (quem pressiona sem estrutura sofre muitos chutes);
  - quem pressiona em curva tapa a linha de passe atrás de si (sombra de cobertura).
- **Impedimento:** a armadilha rende menos (e a bola nas costas rende mais) quando o time não pressiona quem passa. A linha alta (1) já usa a Velocidade da zaga.
- **Altura da linha (referência):** pressão alta 52–55 m do próprio gol, bloco médio 35–45 m, bloco baixo 22–28 m.

## 10. Transição

- **O contra-ataque começa na zona da roubada** (hoje começa sempre no M). Roubar no centro ou por interceptação dá contra melhor. ~80% dos chutes de contra-ataque saem pelas colunas 2–4. Contra linha alta, o atacante no meio-espaço sai livre entre o zagueiro e o lateral.
- **R1 na grade:** conta a cobertura das colunas 2–4 nas faixas de trás (o contra-ataque é de meio-espaço a meio-espaço).
- **Depois de roubar**, se a Decisão não vê espaço, o time **recicla** a posse em vez de contra-atacar.
- **Pressionar ao perder:** a retomada pesa a presença do time nas zonas vizinhas da perda, com o meio-espaço ocupado escalonando melhor.
- **Recompor:** sem mudança.
- **Metas:**
  - gols de contra-ataque em 5–7% do total (régua da Opta);
  - chute de contra-ataque ~1,4× o chute de jogo corrido;
  - time montado para contra-atacar faz 15–20% dos próprios gols assim;
  - o contra-ataque tem eficácia ~2,5× maior que a do ataque comum;
  - perder a bola nas faixas 1–2 vira chute do adversário em ~20%.

## 11. Metas de calibragem (aprovadas em 31/10)

| Grupo | Meta | Fonte |
|---|---|---|
| Geral | ~2,3 gols por jogo; conversão no alvo ~30% | liga atual |
| | ~100 posses por jogo (somando os dois times); ~10% acabam em chute, ~50% em perda | transições (PMC) |
| | Pico de gols e de eficácia depois dos 75' | Chance Conversion, PMC |
| Passe e rotas | Acerto por tipo: voltar/lado ~95%, uma faixa ~84%, pular faixa/último passe ~50%; geral 82–84% | PMC, Driblab |
| | Do meio-espaço, diagonal ≈ 2× o reto; do lado, o reto é mais comum (e prende) | Karun, Tuchel |
| | Volta: 12–22% dos movimentos; pular faixa: 19% (faixa 1) → 7% (faixa 2) → 3% (faixa 3) | Karun |
| | Virada lado→lado: ~1% dos movimentos, ~40% de acerto | Karun, Opta |
| | Bola longa ~10% dos passes (time direto ~11% ou mais) | The Athletic, Driblab |
| | 11–16 posses de 10 passes ou mais por jogo | Driblab |
| Combinações | Tabela com avanço ~4 por jogo; terceiro homem chegando ao terço final ~0,4 (1–2 nos melhores) | footballytics |
| Valor por zona | Chance de gol da jogada pela zona segue o xT da 5×5 | Karun/Soccermatics |
| Finalização | Chutes de jogo corrido quase todos da faixa 5; ~50% no centro | StatsBomb, xT |
| | Cruzamento 13–20% dos gols (motor hoje 15,7%); cut-back certo 0,5–1 por jogo | Bundesliga, footballytics |
| | Toques na área: 14–22 no time comum, 30–35 no forte; o forte sofre 10–13 | footballytics |
| | Time forte: 12–16 chutes e 1,8 de xG ou mais por jogo; times grandes jogam ~60 min contra bloco baixo | TFA, footballytics |
| Pressão e transição | PPDA 5–8 (pressão 2) / 15–20 (pressão 0) | TFA, Driblab |
| | Contra-ataque 5–7% dos gols; chute de contra ~1,4×; eficácia ~2,5× | pacote tático, PMC |
| | ~80% dos chutes de contra-ataque pelas colunas 2–4 | Spielverlagerung |
| | Perder a bola nas faixas 1–2 → chute do adversário em ~20% | Driblab |
| Bola aérea | ~26 duelos aéreos por time por jogo; segunda bola 26–36%; quem lança fica com ela em ~25% | The Athletic, Lamberts |
| Formações | 4-2-3-1 > 4-4-2; 4-2-3-1 < 3-5-2 e < losango no meio; 5-3-2 sofre mais cruzamentos e os defende melhor; 4-1-4-1 sofre contra 5 na última linha; árvore e losango fortes por dentro e fracos pelo lado; 4-2-4 fácil de contra-atacar | várias |
| | O 4-3-3 ocupa com a bola os dois meios-espaços da faixa 4 | entrelinhas |
| | "Território sem xG": o time concentrado nas faixas 1–2 tem posse e pouco xG | TFA |
| Papéis | Os outros 3 papéis de lateral/ala perto do padrão em pontos por jogo | sim_papeis_laterais |
| Valor das posições | Não piorar o equilíbrio de hoje (o zagueiro, em 41%, se corrige na etapa dos zagueiros) | plano dos papéis |

Metas já cumpridas hoje que **não podem piorar**: gols de contra-ataque, conversão no alvo, pênalti (~8,8% dos gols; xG do pênalti 0,76), escanteio (~11,8%) e saída do goleiro (G2).

## 12. Relatório, analista e medição

- **Mapa de zonas do relatório (opção A, escolhida pelo dono):** as 25 zonas mostram **por onde a bola passou** (volume de duelos em cada uma), e a **taxa de duelos vencidos** aparece **por faixa e por corredor**, onde um jogo tem duelos suficientes. Motivo: hoje são ~66 duelos por time por jogo, o que dá 2–4 por zona em 25 zonas, e a taxa por zona sairia quase toda "—". Maquete: `.superpowers/brainstorm/3997-1793412787/content/relatorio-5x5.html`.
- **Analista e narração** nomeiam a zona 14, os meios-espaços, o fundo pela esquerda etc.
- **Jogos da T0 continuam com o mapa de 9 zonas.**
- **Guardar cada passo** da jogada: quem passou, quem recebeu, zona de origem e de destino, tipo de passo e resultado. Serve à narração, ao replay e à medição.
- **Contadores para a calibragem** (a mesma régua das metas): SCA/GCA (as duas ações antes de chute ou gol), toques na área (passos certos na faixa 5), entradas no terço final, deep completions (passo certo a até 20 m do gol que não é cruzamento), passes e conduções progressivos, PPDA, "field tilt", índice de verticalidade (para a frente ÷ lado e trás), tabelas, terceiros homens, segundas bolas e duelos aéreos.

## 12b. Decisões tomadas depois da revisão do construtor (escolhas do Claude, para o dono conferir)

- **Metas obrigatórias × de esforço.** São **obrigatórias** para publicar:
  - ~2,3 gols por jogo;
  - conversão no alvo ~30%;
  - gols de contra-ataque 5–7%;
  - cruzamento 13–20% dos gols;
  - pênalti e escanteio sem piorar;
  - acerto geral de passe 82–84%;
  - os outros papéis de lateral/ala perto do padrão;
  - valor das posições sem piorar.

  As demais são **de esforço**: o construtor chega o mais perto que conseguir e registra no relatório de calibragem as que ficaram fora e por quê. Em conflito, ganham as obrigatórias. A medição é a de sempre: elencos gerados nas ferramentas `sim_*` (milhares de jogos entre formações e instruções sorteadas) e, no fim, uma conferência com os elencos da liga real.
- **Telas nesta entrega:**
  - muda: o mapa de zonas do relatório e do analista (opção A, seção 12), só nos jogos da T1;
  - continuam funcionando, lendo a grade nova na T1 onde mostram zonas: as outras telas (escalação, vestiário, ao vivo);
  - redesenhar essas telas para 25 zonas fica para depois, a não ser que a leitura da grade quebre alguma.
- **Guardar os passos não precisa de SQL nem de dado novo no banco:** os passos são reconstruídos a partir da semente, como já acontece com o replay e o ao vivo. Os contadores ficam na estatística da partida que o motor já devolve.
- **As mecânicas já calibradas nas 9 zonas** (pé, embalo, `flancoAberto`, `passeXpressao`/`baseDuelo`, escanteio no duelo do lado, falta, cartões, lesões) **passam para a grade**:
  - o que é "por linha D/M/A" vira "por faixa", agrupando as faixas 1 = D, 2–3 = M, 4–5 = A como ponto de partida;
  - o `flancoAberto` vira o duelo da coluna do lado;
  - só é substituído o que este spec troca explicitamente: o `continuidade` dá lugar à diagonal, e o início do contra-ataque no M dá lugar ao início na zona da roubada.
  - **Embalo:** cabe inteiro. Hoje é parte da folga de um duelo levada para o seguinte (`embalo`: metade, com teto). No caminho livre, passa de passo a passo, e é a mesma ideia da "folga decide o próximo passo" e do bônus de quem recebe de frente (diagonal, terceiro homem). O construtor junta os três num mecanismo só, sem somar bônus em dobro.
  - **Duelo pelo lado (`flancoAberto`):** a ideia continua, mas a grade já faz quase tudo sozinha. O duelo da coluna do lado é ponta × lateral, com o 2 contra 1 da ultrapassagem saindo dos pesos. Fica como ajuste fino do xG do cruzamento só se a calibragem mostrar falta; senão, sai.

**Decisões do dono depois da revisão (31/10):**
- **1a:** o relógio e a posse continuam como hoje (ataques por minuto e posse pelo controle do meio), e o caminho livre troca só o que acontece dentro de cada ataque. As metas de "~100 posses por jogo" e "~60 minutos contra bloco baixo" viram conferência aproximada.
- **2a:** o replay dos amistosos já jogados pode mudar com a grade nova (o placar salvo não muda). Não se mantém uma terceira versão do motor.

## 13. O que fica com o construtor

- **A arquitetura do código:** se a grade fica em `motor.js` com um ramo `regrasT1` ou num módulo novo em `src/` (que então entra no `MODULOS` do empacotador), e como manter as 9 zonas intactas para a T0.
- O formato dos dados das 25 zonas e das manchas; a conversão das manchas do rascunho para `COBERTURA`/`papeis.js`.
- Todos os valores numéricos (pesos, dificuldades, bônus, limites, peso pequeno da zona cinza, acaso da segunda bola, limite de segurança de passos), calibrados contra a seção 11 com simulações (`ferramentas/sim_*.mjs`, `calibragem.html`).
- Como o bot (`avaliarZonas`) e a tela de escalação leem a grade na T1.
- Testes no padrão do projeto (`ferramentas/teste_*.mjs`, um por regra nova importante, com `node:assert`).

**Ideias estacionadas (não fazem parte desta entrega):**
- valor por passo (estilo xT/VAEP) nas notas dos jogadores, com crédito ao passe anterior e a quem recebe;
- xP e xGP no relatório;
- linha da pressão por minuto e passes progressivos permitidos por corredor;
- instrução de ritmo;
- curvas de idade por posição na virada;
- zagueiro condutor e competências do zagueiro (vão para a etapa dos zagueiros).

## 14. Fontes

- `2026-10-30-grade-5x5-fontes-spielverlagerung.md`: 22 posts do Spielverlagerung.
- `2026-10-30-grade-5x5-fontes-meio-espaco.md`: meio-espaço e entrelinhas.
- `2026-10-30-grade-5x5-fontes-xt.md`: xT e valor de posse, e a matriz de transição do Karun convertida.
- `2026-10-31-grade-5x5-fontes-terceiro-homem-formacoes.md`: terceiro homem, losango, árvore, 4-2-4 e papéis.
- `2026-10-31-grade-5x5-fontes-passe-driblab.md`: acerto de passe e Driblab.
- `2026-10-31-grade-5x5-fontes-lote-tfa.md`: 80 PDFs do The Football Analyst e outros, incluindo a seção G2 de métricas.
- `2026-10-31-grade-5x5-fontes-lote-html.md`: 36 HTMLs (segunda bola, cut-back, combinações, passe por dificuldade, 4-2-3-1, transições).
- Memória do pacote tático/transição: R1, R4, R5, G2, metas de contra-ataque, half-spaces do Athletic e Marić, mapas de xG por zona.
