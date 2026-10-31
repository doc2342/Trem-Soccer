# Grade 5×5: lote de 18 HTMLs (segunda bola, cut-back, cadeias de xT, combinações), insumo para o spec

São as páginas salvas como HTML em `prototipos/` entre 01:09 e 01:20 de 31/10/2026, cada uma com sua pasta `_files` de imagens. O texto foi extraído por `scratchpad/lote5/h2t.py`, e os gráficos com números foram vistos nas imagens.

## Segunda bola (6 textos: The Athletic com dados da Footovision, Marc Lamberts xSBR, Chun Hang, Football Bunseki, sessão da FAI, treino da Grassroots UK)

Números (os do The Athletic saíram dos gráficos):
1. **Por duelo aéreo, quanto cada time fica com a segunda bola** (Premier League 2024-25): de 26,4% (Leicester) a 36% (City), média ~30,5%. O resto fica com o adversário ou sai.
2. **Duelos aéreos por jogo, por time: de ~16 (City) a ~32 (Palace), média ~26.** **Quem disputa mais bola no alto ganha menos segunda bola** (Palace, Bournemouth, Everton, West Ham): é cara ou coroa repetida. A exceção é o Brentford (muito duelo e boa segunda bola, por estrutura, inclusive no lateral longo).
3. **Bola longa no futebol inglês: 19% dos passes em 2006-07, 10% em 2024-25.**
4. **Quem lança fica com a segunda bola em ~1 de cada 4 lançamentos** (Lamberts, Eredivisie 2025-26: lançamento da defesa com 32 m ou mais até o campo do adversário; média de 24,5%, esperado 22,9%, o modelo não passa de 28% e o melhor time chega a ~50%). **Uns 30% do resultado são acaso puro** (o quique). A maioria das segundas bolas cai no terço do meio, mais do que no de ataque.
5. **A zona de queda tem 10–15 m de raio** em volta de onde a bola cai, e a segunda bola é decidida em 2–3 s.
6. Ganhar a segunda bola tem correlação pequena, mas significativa, com a diferença de xG (os times melhores ganham mais). Não prova causa.

O que decide (Bunseki, The Athletic, Lamberts):
- **compactação e gente perto da zona de queda.** A compactação pesa mais que a sobrecarga num ponto só, porque a cabeçada pode ir para a frente, para trás ou para o lado;
- antecipação e reação;
- o meia do lado oposto (no duplo pivô, um sobe e o outro guarda o espaço entre as linhas: Rodri e Gündoğan no City).

O time que saiu jogando curto e foi forçado a dar a bola longa está esticado e perde a segunda bola. Quem pressiona marcando homem a homem com muita gente deixa espaço entre as linhas onde a bola cai. O Bournemouth faz 2 contra 1 no lado do lançamento (o ponta desvia e o lateral chega).

→ **Proposta para a 5×5 (bola longa / pulo de faixa pelo alto):**
- **1º toque:** duelo aéreo na zona de destino, pelo pacote aéreo já aprovado (ganhar = Posicionamento + Força + Altura; qualidade = Cabeceio).
- **2º toque (segunda bola):** sorteado pela **presença de cada time na zona de queda e nas vizinhas** (a soma dos pesos: compactação e quem está perto), com uma parte grande de acaso (~30%), seja quem for que ganhou o 1º toque.
- Quem ganha a segunda bola segue a jogada dali; se for o adversário, ele recomeça da zona (com contra-ataque se a nossa equipe ficou esticada).
- **Metas:**
  - quem lança fica com a bola em ~25% dos lançamentos (com estrutura boa, até ~40–50%);
  - cada time fica com a segunda bola em 26–36% dos duelos aéreos;
  - ~26 duelos aéreos por time por jogo;
  - quem lança muito ganha proporcionalmente menos segunda bola;
  - bola longa em ~10% dos passes na média da liga (o time direto ~11% ou mais, ver Driblab).
- A antecipação da segunda bola é a Antecipação (caixinha). Por enquanto, a presença na zona faz o trabalho.

## Cut-back, combinações e cadeia de xT (footballytics.ch: 3 textos)

1. **Frequência do terceiro homem (o número que faltava):**
   - footballytics contou o padrão ABCA (três passes certos seguidos, o primeiro e o último para a frente, o último terminando no terço final, o terceiro passe saindo mais de 5 m atrás do início do segundo, só jogo corrido) na Bundesliga 2023-24;
   - **média de 0,4 por jogo; os melhores times fazem 1–2 por jogo.** O próprio texto avisa que é um piso: só dá para detectar no dado de eventos quando quem começa recebe de volta (ABCA), e as combinações de terceiro homem no meio-campo para sair da pressão não entram.

   → **Meta: ataque de terceiro homem que chega ao terço final ~0,4 por jogo em média e 1–2 nos times que mais fazem.** O total com o meio-campo e a saída é maior. O motor pode contar à parte o terceiro homem que termina na faixa 4–5.
2. **Tabela com avanço (ABA: A passa a B e recebe de volta, os dois passes para a frente, ganho de 10 m ou mais, só jogo corrido):**
   - **~4 por jogo** na Bundesliga 2023-24;
   - quase sempre laterais (Hakimi: 48 na temporada, o maior das 5 grandes ligas); fora deles, Adli, Sessa, Stöger, Cairney, De Bruyne;
   - a linha de 4 tem melhores condições para isso.

   → Meta da tabela (aprovada em 29/10): ~4 por jogo, com laterais à frente.
3. **Ultrapassagem por dentro rende mais que por fora**, porque por fora o adversário tem tempo de bascular. Por fora, só vale perto da área (pouca distância). → Confirma o item C1–C2 do lote anterior: a ultrapassagem por dentro (meio-espaço) passa mais e a por fora rende mais perto da área.
4. **"Pêndulo" de um lado para o outro:** a defesa organizada bascula mais rápido do que a bola troca de lado; aí o ponta fica 1 contra 2 em vez de 1 contra 1 (o City sofreu contra Arsenal e Inter). → Confirma: a virada só compensa quando a basculação deixou o outro lado vazio (inversão contra o lado fraco). A troca lenta de lado não ganha nada.
5. **Os times grandes jogam ~60 minutos por jogo contra bloco baixo.** → Peso grande do ataque posicional para os times fortes. Na calibragem, conferir que o time forte passa a maior parte do jogo diante de um adversário recuado (mentalidade negativa do bot contra time forte) e que o terceiro homem, o cut-back e a tabela são as saídas.
6. **Cut-back na Super Liga suíça 2022-23** (25 rodadas):
   - 26 a 52 tentativas por time na temporada (~1–2 por jogo), 31% a 68% de acerto;
   - **0,5 a 1,05 cut-back certo por jogo** ajustado pela posse; "os melhores times fazem só 2–3 por jogo";
   - 14 a 22 toques na área por jogo por time.

   O caminho: chegar atrás da linha pela zona menos protegida até a "zona de assistência" e rolar para trás, entre a pequena área e a marca do pênalti, enquanto os zagueiros correm para o gol. "Quem entra por último na área é o primeiro a chutar" (Lillo). → **Metas: cut-back certo ~0,5–1 por jogo por time; toques na área 14–22 por jogo.**
7. **Cadeia de xT** (Ben Griffis/footballytics): soma o passe, o passe anterior que abriu o espaço e a recepção (correr e dominar no espaço). → Para a revisão das notas: crédito também para quem recebe e para o passe anterior. Na grade, cada passo tem quem passa e quem recebe; dá para guardar os dois.

## Controle das áreas, relatório de eventos, métricas e outros (footballytics: 9 textos)

1. **Toques na área por jogo** (2021-22):
   - mais toques: City 35, Liverpool 32, Real 29, Inter 26 (Ajax 40 na Holanda);
   - menos toques sofridos: City 10, Young Boys 11, Marselha 12, Liverpool 13;
   - mesmo entre os 3 primeiros de cada liga, o mais aberto deixa ~19 e o que menos chega faz ~16;
   - na Suíça, o time comum fica entre 14 e 22.

   Dominar as duas áreas (muitos toques lá, poucos cá) é o retrato do time dominante. "Para criar as chances, o técnico é o principal responsável; para aproveitá-las, os jogadores." → **Metas: toques na área do time forte ~30–35 por jogo e sofridos ~10–13; time médio ~18–22.** Se o motor contar a chegada à faixa 5 como toque na área, dá para conferir na calibragem e até virar linha do relatório ("domínio das áreas").
2. **O chute de fora está sumindo.** Os times trabalham a bola até chutar de dentro da área; quem tem pouca posse e não chuta de fora, chuta pouco e bem. → Meta: a maioria dos chutes de jogo corrido sai da faixa 5. A instrução "finalizar: longe" continua possível, mas é escolha minoritária.
3. **Relatório de eventos de um jogo** (Winterthur 1–1 Young Boys: 1.845 eventos, metade passes):
   - domínio por zona (30 zonas; ≥55% das ações = domínio, 45–55% = disputada);
   - "linha da pressão": passes no terço final por minuto, em média móvel de 4 minutos;
   - passes progressivos permitidos por corredor (esquerda/centro/direita);
   - recuperações no campo do adversário;
   - dribles no campo do adversário (o drible certo no centro vale mais que o perto da linha, porque abre opções dos dois lados).

   → **Ideias para o relatório na 5×5** (além do mapa aprovado): a **linha da pressão** (passes ou passos na faixa 4–5 por minuto ao longo do jogo) e o "passe progressivo permitido por corredor". Ficam anotadas, não fazem parte do spec da grade.
4. **PPDA na Suíça** (contando só os 60% do campo de ataque): Young Boys 6,84, Sion 12,4. Confirma a faixa de 5–8 com a pressão 2. **xG do pênalti: 0,76.** O motor tem pênalti em 8,8% dos gols; conferir a conversão do pênalti na calibragem.
5. **"80% dos times têm os mesmos 20% de problemas":** criar superioridade, furar bloco baixo, criatividade coletiva (e não só o 1 contra 1), pressão coordenada, controle do espaço e transição defensiva. → São exatamente os eixos que a 5×5 trata (superioridades, terceiro homem, cut-back, pressão, compactação, defesa de reserva). Nada novo.
6. Sem conteúdo para o motor: dicas de análise de dados, vieses cognitivos, comparação de jogadores da Bundesliga, envolvimento em sequência de chute (crédito para todos da jogada que termina em chute; serve para a revisão das notas) e a explicação de métricas em alemão (xG, xA, xGOT, xGP, por 90 minutos, ajustar pela posse).

## Resumo do lote

- **Segunda bola com números:**
  - quem lança fica com a bola em ~25% das vezes;
  - cada time fica com a segunda bola em 26–36% dos duelos aéreos;
  - ~26 duelos aéreos por time por jogo;
  - quem disputa mais no alto ganha menos;
  - bola longa em ~10% dos passes.

  Proposta: duelo aéreo pelo pacote aprovado e, depois, a segunda bola pela presença na zona de queda e nas vizinhas, com ~30% de acaso.
- **Frequência do terceiro homem:** 0,4 por jogo chegando ao terço final (1–2 nos melhores), como piso. **Tabela com avanço: ~4 por jogo**, com laterais à frente.
- **Cut-back:** 0,5–1 certo por jogo por time. Toques na área: 14–22 no time comum, 30–35 no time forte, 10–13 sofridos pelo time forte.
- **Os times fortes jogam ~60 minutos contra bloco baixo.**
- A ultrapassagem por dentro rende mais que a por fora (esta só perto da área). O "pêndulo" lento não ganha nada contra a defesa que bascula bem.
- **Ideias para o relatório** (fora do spec): linha da pressão por minuto, passe progressivo permitido por corredor.

## Lote 2 de HTML (14 textos, salvos entre 01:28 e 01:35): passe vertical e diagonal, 4-2-3-1

**Acerto do passe pela direção: continua sem número.** Nenhum dos 14 traz a porcentagem.
- O Marc Lamberts classifica os passes em frente, trás, lateral, diagonal e parado, mas só publica os z-scores (desvios da média), não a frequência nem o acerto.
- O texto mais próximo (o guia "Passing in Football") dá só a escada qualitativa:
  - horizontal: risco baixo (mas não ganha terreno);
  - diagonal: risco médio (exige tempo certo);
  - vertical: risco alto contra adversário organizado.

→ Fica a escada do desenho (voltar < lado < diagonal ≈ médio < reto para a frente contra bloco organizado < pular faixa), calibrada pelas metas que já temos: o acerto por zona do CxT (85–87% no meio, 32–49% no fundo), a frequência da matriz do Karun e a virada a 40–42%.

1. **O passe reto pela lateral (lateral → ponta na mesma linha) é uma armadilha** (Christoph, citando Tuchel, Guardiola e Arteta):
   - quem recebe fica de costas, com o marcador apertando por trás e a sobrecarga do lado da bola, e quase sempre tem de devolver;
   - **Tuchel queria que o adversário jogasse pela lateral, porque esse é o passe ideal para forçar a perda da bola**;
   - as saídas são a diagonal (o lateral por dentro e o ponta aberto, como faz Guardiola), o ponta entrando no meio-espaço na hora do passe (Arteta) e a tabela com a ultrapassagem por dentro (Bielsa).

   → **Confirma com nome e sobrenome:** o passo reto no corredor do lado vale menos que a diagonal (bate com a matriz do Karun, onde do lado o reto é o mais comum, mas é justamente o que prende). Quem recebe o passe reto no lado fica mais sujeito à volta ou à perda. É também a lógica da instrução "forçar para fora" (item 3 do pacote tático, depois da grade).
2. **4-2-3-1** (Coaches' Voice em inglês e em português, Vanta Sports):
   - o duplo pivô protege a zona 14 e deixa os dois laterais atacarem ao mesmo tempo;
   - o 10 é o elo entre as linhas;
   - os pontas abertos prendem a linha de 4, e o 9 fica sozinho contra dois;
   - sem a bola vira 4-4-1-1 ou 4-5-1, e o meia do lado oposto fecha por dentro;
   - um pivô sobe no contra-ataque.

   Pontos fracos:
   - o 9 isolado;
   - o meio de 3 sofre contra um de 4 (losango) e contra o 3-5-2, que afoga o 10;
   - com os dois laterais lá na frente, a virada no contra-ataque passa pelos dois pivôs.

   **Forte contra o 4-4-2** (o 10 fica atrás dos dois meias deles e os pivôs ganham a saída) e contra o 4-3-3 (o volante deles fica entre o 10 e o 9). → **Metas de confronto: 4-2-3-1 > 4-4-2; 4-2-3-1 < 3-5-2 e < losango no meio; virada contra o 4-2-3-1 com os dois laterais subindo rende mais.** Junto com o rest-attack (a melhor estrutura de contra-ataque, Spielverlagerung).
3. **FIFA, Mundial Sub-20 2025:**
   - **até 8,5–9,9 chutes por 60 minutos de posse saindo em até 10 s depois de recuperar a bola no campo do adversário** (Nigéria, Colômbia, Japão);
   - 13 gols no torneio em até 15 s depois de recuperar no próprio campo;
   - a Colômbia sai com 5 na frente e 5 na defesa de reserva;
   - França e EUA enfrentaram bloco baixo em 30–33% do tempo sem a bola do adversário;
   - tempo de posse e tempo no terço final caíram 22,9% desde 2023 (sequências mais curtas e verticais).

   → Para a pressão alta: roubar no campo do adversário vira chute rápido com frequência alta nos melhores. A meta da R4/contra-ataque já cobre a forma; o número por 60 minutos de posse é referência extra.
4. **Outros (FIFA Training Centre, Soccer-Coaches, Vanta, Football Paradise, "The Crucial Role of Passing", The Football Analyst sobre verticalidade e a página do Spielverlagerung sobre construção vertical, que já tinha sido lida em PDF):**
   - **o passe diz para onde ir:** pé da frente = de primeira, pé de trás = tem tempo, no passo = ataca o espaço;
   - jogar de lado é preparar o vertical;
   - contra pressão forte, o passe para trás bem dado reorganiza;
   - na Bundesliga, o passe progressivo (pelo menos 10 jardas mais perto do gol no próprio campo) é a régua do avanço.

   Nada que mude o desenho.

## Lote 3 de HTML (4 textos, salvos entre 01:37 e 01:39)

1. **Dificuldade do passe e acerto** (artigo na PMC, "Who are the best passing players…", Série A brasileira, 2.522 passes com dados de posição):
   - passes fáceis: 53,9% dos passes, **94,9% de acerto**;
   - médios: 23,6%, **84,0%**;
   - difíceis: 22,5%, **49,3%**;
   - acerto geral: 82,3% (Premier League 84,3%);
   - atacantes e meias ofensivos fazem mais passes difíceis;
   - o que separa os melhores passadores é o acerto nos passes médios e difíceis, não nos fáceis.

   → **É a régua que faltava, em forma de "dificuldade" em vez de "direção":**
   - passo fácil (para trás ou para o lado, sem pressão) ~95%;
   - médio (uma faixa para a frente) ~84%;
   - difícil (quebrar linha, pular faixa, passe na área) ~50%.

   **Metas por tipo de passo na 5×5: voltar/lado ~95%, uma faixa para a frente ~84%, pular faixa ou último passe ~50%; acerto geral ~82–84%; o Passe pesa mais nos passos médios e difíceis.** Junto com o xP da Driblab (0,92 / 0,26 / 0,78) e o acerto por zona do CxT. (O duelo do motor é passar a linha marcada, não só acertar o passe: comparar a tendência, como combinado.)
2. **O valor do passe para trás** (Analytics FC/TransferLab, "Pass before Progression"):
   - os passes para trás e para o lado logo antes de um passe progressivo ganham o valor desse passe seguinte;
   - nos gols analisados, **todos os passes não progressivos foram de primeira** (mudam o ângulo sem perder o ritmo);
   - quem mais faz: Jorginho, Fabinho, Alexander-Arnold, Plea (o 9 de costas).

   → Confirma a volta com valor quando prepara o passe para a frente seguinte, e o crédito para quem fez o passe anterior (revisão das notas, cadeia de xT).
3. **Transições ofensivas no futebol feminino de elite** (artigo na PMC, 3.610 transições de grandes torneios):
   - **~106 transições por jogo**, como no masculino;
   - resultado: **1,3% gol, 9,1% chute, 21,1% entrada no terço final, 48,9% perda da bola**;
   - com 3 ou mais passes que furam linha, 34,9% de sucesso, contra 9,5% sem;
   - o **contra-ataque tem 28% de sucesso, contra 10,6% dos outros tipos de início**;
   - adversário com a linha baixa → mais eficácia, porque a recuperação foi perto do gol dele;
   - 5 ou mais passes → mais sucesso que 1–2;
   - **as transições dos minutos 76–90 são as mais eficazes**.

   → Metas de conferência: ~100 posses por jogo somando os dois times, ~10% terminando em chute e ~50% em perda. O contra-ataque rende cerca de 2,5 vezes o ataque comum (bate com a R4). Pico de eficácia no fim do jogo (bate com "gols depois dos 75'").
4. "Forward Pass and Backpropagation" é sobre redes neurais (aprendizado de máquina), não sobre futebol. Fica de fora.
