# Grade 5×5: acerto de passe e Driblab (insumo para o spec)

Fontes lidas em 31/10/2026:
- os 6 PDFs que o dono salvou depois de 00:08 (Sportmonks, FB Insight, Ana'Lys, Jon Blum, Football Coaching Egypt e o "Expected Passes" da Driblab);
- 4 posts do blog da Driblab, achados por busca no site:
  - "Expected Threat: dribbles, passes and carries";
  - "Accurate and progressive: the kings of passing";
  - "Pressing can also be expensive";
  - "Spatial Coverage: How Does Your Team Play?".
- Resumos que a busca devolveu de mais posts da Driblab: Linebreaker, a reposição de De Bruyne, o meio do Newcastle, a final da Libertadores e as bolas em 3D.

O blog da Driblab tem dezenas de páginas, quase todas de scouting e notícias. Não tem nada sobre acerto do passe por direção, segunda bola ou terceiro homem. Os gráficos com números são imagens e não aparecem no texto.

## Acerto do passe

1. **xP da Driblab:** a chance de cada passe ser completado, calculada pela posição, ângulo, distância, parte do corpo e tipo de jogada. Três passes do mesmo lance mostram a escada:
   - zagueiro→zagueiro: 0,92;
   - o passe que quebra linha (Araujo→Raphinha): 0,26;
   - o último passe: 0,78.

   Os melhores passadores completam 5 a 7 pontos acima do esperado (Kroos +7%, Rodri +5,3%, Xhaka +4,8%). → Dá uma escala para o Passe no duelo do passo: o passador de elite rende uns 5–7 pontos de acerto acima da média no mesmo passe.
2. **Por função** (Ana'Lys, Sportmonks):
   - os zagueiros têm o maior acerto (passe curto e seguro);
   - os meias, menos (arriscam mais);
   - os atacantes, o menor (toque de primeira, sem tempo).

   **Sob pressão, um meia cai de 92% para 78%.** → A pressão tira uns 14 pontos de acerto. É mais uma meta para a pressão regular as voltas e a dificuldade do passo.
3. **Contexto:** quem está ganhando joga mais seguro e acerta mais, quem perde arrisca mais. Campo molhado e chuva baixam o acerto. → O motor já tem chuva (`opcoes.chuva`). Conferir se ela pesa no duelo do passo na 5×5.
4. **Jon Blum (Premier League, 2009–14):**
   - o acerto do time se repete muito (R² 0,89 entre as metades da temporada) e explica parte dos pontos (R² 0,36);
   - o acerto que o time deixa o adversário ter (efeito da pressão) também se repete (R² 0,66), mas quase não explica pontos (R² 0,02).

   Os times de Pochettino e Van Gaal, que pressionavam mais, deixavam o adversário acertar menos. → A pressão muda o jogo do adversário sem decidir o resultado sozinha. Confirma o "pressão: qualidade mais que quantidade".
5. **Bom passador = lê o defensor em dilema** (FB Insight): o passe em profundidade sai fácil quando o zagueiro está dividido entre o 9 e o "segundo atacante" logo atrás (Palmer→João Pedro). → É o dilema do zagueiro e o terceiro homem. O que pesa é a Decisão, mais do que a força do passe.

## Direção, progressão e pressão (Driblab)

6. **Passe progressivo:** leva a bola pelo menos 10 m em direção ao gol. O perfil "quebra-linhas" tem 40% ou mais dos passes para a frente; Baena tem 37,4% e De Bruyne, 30,7%. → **Parte dos passes que vão para a frente: ~30–40% nos meias criativos.** É uma meta para a frequência do passo para a frente contra lado e volta no caminho livre (no motor, por jogador ou por faixa).
7. **Posses com 10 passes ou mais: ~11–16 por jogo** (Lazio de Sarri 11,5 caindo de 13,4; Girona 16,2). → Meta para as jogadas longas com voltas no caminho livre.
8. **Bola longa:** o Palmeiras, vertical, dá uma bola longa a cada 8,79 passes (~11%). → Meta para a frequência do pulo de faixa num time de passe longo.
9. **PPDA (passes que o adversário troca por ação defensiva):**
   - Roma de Gasperini: 6,54, a pressão mais intensa das 5 grandes ligas, com 15 recuperações no campo do adversário por jogo;
   - Lens depois da mudança de técnico: 17,5 (pouca pressão).

   → Meta para a instrução de pressão: a pressão 2 deve ficar perto de PPDA ~7 e a 0 perto de ~15–18.
10. **Pressão cara:** o Colônia (o menor PPDA das 5 ligas) e o Leeds do Bielsa pressionam muito e sofrem muitos chutes. O City pressiona e sofre poucos. → Confirma o custo da pressão (compactação e linha alta). Pressionar sem estrutura expõe.
11. **Perda perto do próprio gol:** o Girona perde 6,62 bolas por jogo nos primeiros 40 m, e ~20% delas viram chute do adversário (1,38 por jogo, o maior da LaLiga). → **Meta: perder a bola nas faixas 1–2 gera chute do adversário em ~20% das vezes.** É o custo do toque de volta e do terceiro homem errado.
12. **Recuperação rápida (pressão pós-perda):** recuperar a bola a pelo menos 40 m do próprio gol e em até 8 s depois de perder. → É a régua para medir a regra "pressionar ao perder" na grade.
13. Linhas compactas ajudam, mas espaço demais entre a primeira e a última linha vira problema (o Girona). → Confirma a compactação entre as faixas vizinhas.

## O que ainda falta

- Acerto do passe pela **direção** (para trás, para o lado, para a frente).
- Matriz de para onde vai a bola a partir de cada zona.
- Frequência do terceiro homem.
- Segunda bola.
