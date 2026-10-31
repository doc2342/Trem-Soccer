# Grade 5×5 — o que os posts do Spielverlagerung dizem (insumo para o spec)

Lidos em 30/10/2026 os 22 PDFs "»" de `prototipos/` (Spielverlagerung). O "Chat GPT: Diagonality" é a versão escrita por IA que o próprio site publicou para comparar com o "Tactical Theory: Diagonality" (feito por gente). Uso o original e cito o do ChatGPT só onde os dois dizem a mesma coisa. "The Half-Spaces" (Maric 2014) já tinha sido lido antes (ver o pacote tático).

Números do motor de hoje: `node ferramentas/sim_conversao.mjs` (5.000 jogos 4-4-2, T0).

## 1. A grade confirmada

- O campo de treino do Guardiola tem 4 linhas verticais e **5 corredores**: 2 lados, 2 "corredores interiores" (as meias-luas) e o centro. Os corredores interiores são "os mais importantes", porque ficam entre todas as linhas do adversário e na diagonal do gol (Juego de Posición).
- A DFB divide a altura da pressão em **6 faixas** (terços × alto/baixo) (Pressing…). As nossas 5 linhas, por faixa de posição, cabem nisso.
- Regra de ocupação do Pep: no máximo 3 jogadores numa linha horizontal e 2 numa vertical. É a lotação da T1, agora por zona.

## 2. Rotas entre colunas (o `escolherLado` com 5 colunas)

| Fonte diz | Motor hoje | Proposta para a 5×5 |
|---|---|---|
| A diagonal vale mais que a reta: ganha terreno e muda o ponto de ataque. Um passe vale mais se **termina** na meia-lua e mais ainda se **começa** na meia-lua ou no centro. Centro→lado < meia-lua→meia-lua. Passe de fora para dentro obriga a girar; de dentro para fora o jogador recebe de frente (Diagonality; Vertical build-up; Half-Spaces) | `continuidade` 1,3 favorece **seguir no mesmo corredor** | Trocar por preferência pela **diagonal curta**: subir de linha indo para a coluna vizinha (lado→meia-lua, meia-lua→centro). Centro→lado com peso menor |
| Virada longa lado→lado oposto: só 40% de acerto e 17% de resultado bom (McMullan/Opta). Funciona quando é rasteira e forte (Xabi Alonso) e o bloco basculou (Compactness) | não existe | Virada como rota de risco: sorteio de perda maior, e quando dá certo vira 1 contra 1 no lado vazio (a basculação já deixa o lado oposto vazio). Meia-lua→meia-lua oposta tem risco menor (são 2 zonas, não 4) |
| Do lado, o "colapso" da defesa é mais difícil (o lateral do outro lado não chega). Atacar pelo lado vale quando o centro fecha. Quem dá a diagonal é o **ponta** (corta para dentro), não o lateral/ala (Diagonality) | `flancoAberto` (atk/def do lado) | Natural na 5×5: o duelo da coluna 1/5 nas linhas 4–5 é ponta × lateral |
| Sobrecarga vale mais na meia-lua e no centro, menos no lado. "Zonas de ouro" contra bloco baixo = meia-lua entre linhas. Linha alta → +1 na última linha; linhas próximas → +2 na meia-lua (Overloads) | lotação única de 2,5 | Calibrar `lotacao.limite` por coluna (o lado lota antes). As zonas ficam menores, então o limite tem que ser recalibrado de qualquer jeito |

## 3. Tipo de chance pela zona final (linha 5)

Zonas de assistência que funcionam (González-Rodenas, Champions League, em Chance Conversion):
1. Centro do ataque passando em profundidade. Mais de 22% das chances atrás da última linha viram gol, contra menos de 8% das chances na frente da linha.
2. Fundo da área pelos lados de dentro (cutback/passe rasteiro cruzando a pequena área).
3. Lados entre a linha da área e a altura do pênalti ("inside diagonal").
- O fundo do lado de fora (linha de fundo aberta) **quase não dá assistência**. Na área, a penetração acontece pela meia-lua, e o passe a mais rende mais que o chute direto da meia-lua (Pressing…). O chute de ângulo diagonal tem xG maior que o do mesmo lugar mais aberto (Diagonality).

| Fonte | Motor hoje (sim_conversao) | Proposta |
|---|---|---|
| Cruzamento: 72 cruzamentos por gol. Bundesliga: 13% dos gols direto de cruzamento. Quem cruza mais não converte mais (Ineffective tool) | cruzamento = ~15,7% dos gols (3,9 chutes/jogo, xG 0,107) | **Está na faixa, não mexer** |
| Enfiada: 45% dos passes-chave viram gol; cruzamento: 20% (2,25×) | profundidade xG 0,322 contra 0,107 do cruzamento (3,0×) | Aceitável (a métrica é outra); conferir de novo na calibragem |
| Colunas 2/4 da linha 5 (meia-lua da área) | `corte` = ponta que corta e chuta | Da meia-lua: `corte` (pé invertido) + passe rasteiro/cutback para a área. Coluna 1/5 da linha 5: cruzamento, com qualidade menor quando é o "fundo aberto" |
| Pé invertido na meia-lua: o pé bom faz o difícil (drible, enfiada, chute). Messi supera o xG vindo da meia-lua direita (Diagonality; Chance Conversion) | `ajusteDoPe` por **posição** | Ajuste do pé pela **coluna** da ação (meia-lua: pé invertido ajuda; lado: pé natural cruza) |

## 4. Contra-ataque e rest-attack

- A largura do contra é **de meia-lua a meia-lua**, não de lateral a lateral. O ponta do lado oposto fecha para o centro. A penetração é mais pelas meias-luas, porque o centro está mais povoado (Pressing…). Já anotado antes: mais de 70% dos gols de contra saem pelo centro.
- Rest-attack: 4 papéis no contra (2 corredores abertos, o 9 que fixa os zagueiros, um conector). O **4-2-3-1 tem a melhor estrutura**, porque tem um 10 atrás de 3. O 4-4-2 e o 5-3-2 dependem da corrida longa do 8 ou do ala (Rest-Attack).
- Recuperar a bola no centro e por interceptação dá contras melhores (Rest-Attack; Chance Conversion).
- **Proposta:** a R1 hoje usa a soma do peso nas zonas A sem a bola (`saida`). Na 5×5, a qualidade do contra passa a depender também de **cobrir as colunas 2–4** nas linhas 4–5 sem a bola (corredores + fixador). Os chutes do contra saem sobretudo das colunas 2–4.

## 5. Defesa na grade

- 3 zagueiros cobrem centro + 2 meias-luas; a linha de 5 tapa as meias-luas, mas sofre com circulação e diagonais nelas e coordena pior o impedimento (Three at the back). Na 5×5 isso sai da cobertura, sem regra nova. O ala pendular (o do lado sobe, o outro fecha) já é a `alaPorLado`.
- Marcação por zona = basculação. Na 5×5 a basculação espalha por 5 colunas e deixa o lado oposto vazio, o que convida à virada (item 2).
- Bloco compacto empurra o adversário para o cruzamento (Compactness), o que já acontece (retranca → cruzamento).
- Lateral baixo na saída (lateral Fixo/cobertura): reserva + o ponta adversário não dobra → o nosso ponta ganha 1 contra 1 (Deep Full-Backs). Na 5×5 sai naturalmente do duelo da coluna.

## 6. Bola longa

- Alvo no 9, no centro ou na meia-lua, com alguém logo atrás no mesmo corredor ou na diagonal para receber o passe de volta (layoff). Bola longa saindo do zagueiro do lado progride menos. O 9 procura o zagueiro pior de cabeça (Long Ball).
- **Proposta:** na 5×5, a bola longa vai para as colunas 2–4 da linha 5, e o duelo aéreo é contra o zagueiro daquela coluna.

## 7. Fora da 5×5 (pequeno, só T1)

- **Passe curto × pressão alta pela qualidade:** time que resiste à pressão (De Zerbi, Busquets) vira o jogo contra a pressão alta (Timing Game; Vertical build-up). Hoje `passeXpressao.curto[2]` é −0,35 fixo. Proposta: escalar pelo Domínio/Passe médio de quem sai.
- Ideias estacionadas (só se alguém pedir): instrução "marcar o jogador X" (cão de guarda); pressão larga × estreita; pressão "falsa"/rítmica.

## Metas de calibragem novas

- Gols de cruzamento: 13–20% dos gols (motor 15,7% ✓); ~70 cruzamentos por gol, se um dia o motor contar cruzamentos.
- Virada longa: ~40% de acerto, ~15–17% de resultado bom.
- Chutes de contra-ataque saindo das colunas 2–4: ~80% ou mais.
- Gols por minuto: pico depois dos 75' (Chance Conversion). Medir no motor.
- Bola parada (Champions League): 25% dos gols, com 10% de pênalti, 8% de falta e 7% de escanteio. Motor: pênalti 8,8% ✓; escanteio 11,8% (no padrão da Premier League; a Champions League tem menos), sem mudança por enquanto.
