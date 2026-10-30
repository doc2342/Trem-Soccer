# Primeira fatia dos papéis: laterais — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixo, Apoiador, Construtor e Invertido funcionando de ponta a ponta (motor com zonas com e sem a bola, nota no papel, escolha na escalação, bot, narração, calibragem), com a base que os outros grupos de papéis vão reaproveitar.

**Architecture:** Um módulo novo `src/papeis.js` guarda a definição de cada papel (posições, pesos da ficha, mapa com e sem a bola, gasto de energia). A escalação passa a levar `papel` em cada vaga (`{ j, pos, papel }`); o motor troca o mapa único `COBERTURA[pos]` por dois mapas (com a bola para `atk`/quem tem a bola, sem a bola para `def`/quem marca). Sem papel (ou com o papel padrão) o motor dá exatamente o jogo de hoje. Tudo só vale a partir da T1: `calcularPartida` tira os papéis antes de `PAPEIS_DESDE`, igual ao pé fraco.

**Tech Stack:** JS (ES modules, sem build), testes `node:assert` em `ferramentas/teste_*.mjs`, Postgres/Supabase (SQL numerado), função `rodada` gerada por `ferramentas/empacotar_funcao.py`.

**Spec:** página do plano `C:\Users\PC\Documents\ManagerOnline\Papeis dos jogadores - plano fase 2.html` (seção 03 fichas dos laterais, seção 04 "Laterais DR DL" e "Alas WBR WBL", "Aprovados para a etapa 2 (28/10)", seção 05 "Primeira fatia: laterais"). Publicada em https://claude.ai/artifact/N9zKsMujDFiTj4Hw3sFenc.

## Global Constraints

- Tudo em português do Brasil: código, comentários, nomes, textos, commits.
- Sem `Math.random()` no motor; a semente reproduz o jogo.
- "Sem escolha, nada muda": time sem papel escolhido (ou só com os papéis padrão) joga igual a hoje, lance a lance, com a mesma semente.
- Papéis só valem nas partidas a partir da temporada 1 (`PAPEIS_DESDE = 1` em `src/papeis.js`); a liga ao vivo está na T0.
- O empacotador exige `import { … } from "./x.js";` numa linha e um `export const|let|function` por declaração; `papeis` entra em `MODULOS` de `ferramentas/empacotar_funcao.py` antes de `motor`.
- SQL novo: arquivo numerado idempotente com cabeçalho (o que faz, o que precisa, o que fazer depois). Próximo número livre: 164.
- `notaNaPosicao` (valor, teto, treino, escalar os melhores) **não muda** nesta fatia; a nota no papel é nova e paralela.

## Decisões tomadas neste plano (o dono pode virar)

1. **Gasto de energia relativo ao padrão da posição**, para valer "sem escolha, nada muda": os valores aprovados (Apoiador no ala +15%, Apoiador no lateral +10%, Fixo −5%) viram multiplicador ÷ o do papel padrão da posição. DR/DL: Fixo 1, Apoiador 1,16, Construtor e Invertido 1,05. WBR/WBL: Apoiador 1, Fixo 0,83, Construtor e Invertido 0,87.
2. **O ala que muda com o lado da bola** vale para quem está no ala com papel diferente do padrão (Fixo, Construtor, Invertido no WB). O Apoiador no ala é o ala de hoje e fica igual; ligar para todos os alas é uma linha de CONFIG depois da calibragem.
3. **Passagem do Apoiador** (por dentro ou por fora) só no DR/DL, onde ele não é padrão. "Ponta que fica aberto" = quem está na frente do mesmo lado em RW/LW/MR/ML (os padrões desses lugares são Agudo e Garçom); em AMR/AML (padrão Condutor, que corta) a passagem é por fora, o mapa da ficha. Quando os pontas ganharem papel, a regra passa a ler o papel.

## Review Focus

1. Tática salva antes da fatia (sem `papeis`) tem que carregar e jogar igual — `taticaDoDirigente` com `dados.papeis` ausente.
2. Vaga que troca de posição (arrastar DR para MC, formação torta) com papel de lateral salvo: o papel vira nulo, nada quebra.
3. Substituto que entra numa vaga de lateral: entra no papel padrão (ou no de quem saiu, se valer para a posição dele); papel inválido nunca chega ao motor.
4. Papel adulterado na tática (`"xyz"`, papel de outra posição): `taticaDoDirigente` descarta.
5. Lateral esquerdo: os mapas são o espelho do direito (DL/WBL), inclusive a passagem e o lado da bola.

---

### Task 1: Definição dos papéis e nota no papel — Modelo: Opus

**Files:**
- Create: `src/papeis.js`
- Modify: `ferramentas/empacotar_funcao.py` (`MODULOS`: `"papeis"` depois de `"modelo"`)
- Test: `ferramentas/teste_papeis.mjs`

**Interfaces:**
- Produces:
  - `PAPEIS_DESDE = 1`
  - `PAPEIS: { [chave]: { nome, faz, custa, pesos: {atr: peso}, mapas: { [pos]: { com: {zona: w}, sem: {zona: w} } }, gasto: { [pos]: mult } } }`, chaves `fixo`, `apoiador`, `construtor`, `invertido`. Mapas só do lado direito (DR, WBR); o esquerdo sai por espelho.
  - `PAPEL_PADRAO: { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador" }`
  - `papeisDaPosicao(pos) -> string[]` (vazio para posição sem papéis ainda)
  - `papelValido(pos, papel) -> boolean`
  - `mapasDoPapel(pos, papel) -> { com, sem } | null` (null = usar `COBERTURA[pos]` nas duas fases; já espelhado para DL/WBL; null também para o papel padrão, para o motor seguir pelo caminho de hoje)
  - `notaNoPapel(j, pos, papel) -> number` (pesos da ficha × atributos / 100 × `FAMILIARIDADE[familiaridade(j, pos)]`)
  - `gastoDoPapel(pos, papel) -> number` (1 para padrão e sem papel)
  - `espelharLado(mapa)` sai de `motor.js` e passa a ser exportado daqui (motor importa).

Valores (spec, seção 03 e 04; mapas do DR/WBR, zonas A·M·D × E·C·D):

| Papel | Pesos | DR com | DR sem | WBR com | WBR sem |
|---|---|---|---|---|---|
| fixo | des17 mar14 vel14 pos12 pas10 res7 cru6 cab5 dom5 com4 equ3 for3 | = COBERTURA.DR | = COBERTURA.DR | AD10 MD40 DC5 DD45 | MD35 DC10 DD55 |
| apoiador | vel17 cru14 dri11 res11 pas10 des10 pos7 cri5 dom5 equ5 mar5 | AD35 MD35 DC5 DD25 | AD10 MD40 DC5 DD45 | = COBERTURA.WBR | = COBERTURA.WBR |
| construtor | pas17 vel14 des13 pos11 dom10 mar10 cri9 res7 cru3 equ3 dri3 | AD5 MD40 DC10 DD45 | MD30 DC15 DD55 | AD10 MC10 MD50 DD30 | MD45 DC10 DD45 |
| invertido | pas17 des15 pos13 dom11 mar10 equ9 cri8 vel8 res4 agr3 for2 | MC35 MD10 DC15 DD40 | MC10 MD20 DC15 DD55 | AC10 MC40 MD25 DD25 | MC15 MD40 DD45 |

Gasto: decisão 1 acima. Textos `faz`/`custa`: uma frase curta de cada, tirada da ficha (servem à tela e ao aviso).

- [ ] **Step 1: Teste que falha** — `teste_papeis.mjs`: cada papel tem pesos somando 100 e cada mapa somando 1 (±1e-9); `mapasDoPapel("DR","fixo") === null` e `mapasDoPapel("WBR","apoiador") === null`; `mapasDoPapel("DL","apoiador").com` é o espelho do DR (`AE: 0.35, ME: 0.35, DC: 0.05, DE: 0.25`); `papelValido("DR","invertido")` true, `papelValido("MC","fixo")` false, `papelValido("DR","xyz")` false; `gastoDoPapel("DR","apoiador")` ≈ 1.10/0.95; `notaNoPapel` de um jogador com todos os atributos 30 e natural = 30.
- [ ] **Step 2:** `node ferramentas/teste_papeis.mjs` → falha (módulo não existe).
- [ ] **Step 3:** criar `src/papeis.js`; mover `espelharLado` do motor para cá; somar `"papeis"` ao `MODULOS`.
- [ ] **Step 4:** teste passa; `python ferramentas/empacotar_funcao.py` roda sem erro.
- [ ] **Step 5:** commit.

### Task 2: Motor com mapa com e sem a bola — Modelo: Opus

**Files:**
- Modify: `src/motor.js` (`novoJog`, `recalcular`, `iniciar`, `criarChance`, `duelo`, uso de `zonas` na linha de impedimento ~567, `minuto` gasto de energia, `entrar` na substituição)
- Test: `ferramentas/teste_papeis_motor.mjs`

**Interfaces:**
- Consumes: `mapasDoPapel`, `gastoDoPapel`, `papelValido`, `espelharLado` (Task 1).
- Produces: escalação do motor aceita `{ j, pos, papel? }`; o jogador em campo guarda `papel`; o time ganha `t.zonasDef` (quem marca, por zona) ao lado de `t.zonas` (quem tem a bola). `avaliarZonas(escalacao)` já devolve `atk`/`def` com os mapas dos papéis (o minimapa da tela e o bot usam).

Regras:
- `recalcular`: `atk[z]` e `t.zonas[z]` saem do mapa com a bola; `def[z]` e `t.zonasDef[z]` do mapa sem a bola; sem papel ou papel padrão, os dois são `COBERTURA[pos]`.
- Quem usa `zonas` para defender passa a usar `zonasDef`: marcador do duelo (`def.zonas[espelho(zona)]`), zagueiro da chance (`def.zonas.DC`), `comDefesa`. Quem tem a bola continua em `zonas` (`AC` da área, `escolherLado`, impedimento na perda).
- `controle` (posse) segue somando `atk` e `def` do meio, como hoje.
- Energia: `gasto *= gastoDoPapel(jog.pos, jog.papel)`.
- Substituição (`entrar`): o substituto herda o papel de quem saiu se `papelValido(pos, papel)`, senão sem papel. Troca de posição por ordem também zera papel inválido.

- [ ] **Step 0: Conferência com o motor de hoje** — antes de mexer, rodar 300 partidas com sementes 1..300 e um 4-4-2 e um 3-5-2 gerados com semente (`gerarElenco`), gravar `JSON.stringify` de placar, estatísticas e narração num arquivo do scratchpad.
- [ ] **Step 1: Teste que falha** — `teste_papeis_motor.mjs`: (a) mesma semente, escalação sem papel × com `papel: "fixo"` nos DR/DL e `"apoiador"` nos WB → resultado `deepEqual`; (b) DR `apoiador` muda `avaliarZonas(...).atk.AD` para cima e `def.DD` para baixo em relação ao padrão; (c) DR `invertido` aumenta `atk.MC` e quase não muda `def.MC`; (d) DL `apoiador` aumenta `atk.AE` (espelho); (e) papel `"xyz"` no DR joga igual ao sem papel.
- [ ] **Step 2:** rodar → falha em (b)–(d).
- [ ] **Step 3:** implementar as regras acima.
- [ ] **Step 4:** teste passa; repetir o Step 0 com o motor novo e comparar os arquivos → idênticos; `node ferramentas/testes.mjs` passa.
- [ ] **Step 5:** commit.

### Task 3: Passagem do Apoiador e ala pelo lado da bola — Modelo: Opus

**Files:**
- Modify: `src/motor.js` (`recalcular`, `montarDefesa`, `duelo`, `CONFIG`)
- Test: `ferramentas/teste_papeis_motor.mjs` (casos novos)

**Interfaces:**
- Consumes: Task 2 (`jog.papel`, mapas por fase).
- Produces: `CONFIG.papeis = { passagemPorDentro: { AD: -0.20, AC: 0.10, MD: 0.10 }, alaPorLado: 0.3 }` (valores iniciais, ajustados na Task 7).

Regras:
- **Passagem:** Apoiador em DR/DL com alguém do mesmo lado em RW/LW/MR/ML (lado lido de `POSICOES[pos].lado`, nunca do nome da formação) → mapa com a bola soma `passagemPorDentro` (espelhado na esquerda). Com AMR/AML ou ninguém na frente, mapa da ficha.
- **Ala pelo lado da bola:** só para WB com papel não padrão (decisão 2). `montarDefesa` passa a devolver uma defesa por corredor (`dz` para E, C, D); no corredor do lado do ala, `alaPorLado` do peso dele em DD vai para MD; no corredor oposto, vai para DC. `duelo` usa a defesa do corredor da zona (`zona[1]`). Sem ala desses, as três defesas são iguais à de hoje.

- [ ] **Step 1: Teste que falha** — (a) DR Apoiador com RW na frente: `atk.AC` maior que com AMR na frente; (b) DL espelhado; (c) time sem WB não-padrão: resultado `deepEqual` ao da Task 2 com a mesma semente; (d) WBR Fixo: defesa no corredor D tem `MD` maior e `DD` menor que no corredor E.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** teste passa; Step 0 da Task 2 continua idêntico; `node ferramentas/testes.mjs`.
- [ ] **Step 5:** commit.

### Task 4: Papel na tática salva, porta da T1 e servidor — Modelo: Opus

**Files:**
- Modify: `src/rodada.js` (`taticaDoDirigente`, `calcularPartida`, abertura da transmissão `escalacoes`)
- Modify: `src/bot.js` (`taticaBot`: escolhe papéis)
- Test: `ferramentas/teste_papeis_tatica.mjs`

**Interfaces:**
- Consumes: `papelValido`, `notaNoPapel`, `papeisDaPosicao`, `PAPEL_PADRAO`, `PAPEIS_DESDE`.
- Produces: tática salva ganha `papeis: (string|null)[]` alinhado com `vagas`; escalação devolvida por `taticaDoDirigente` e `taticaBot` traz `papel` em cada vaga; o lance de abertura grava `papel` nos titulares quando houver.

Regras:
- `taticaDoDirigente`: `papel = papelValido(vagas[i], dados.papeis?.[i]) ? dados.papeis[i] : null`. Titular trocado por lesão herda o papel da vaga.
- `calcularPartida`: antes de `PAPEIS_DESDE` (ou sem `temporada`), tira `papel` das escalações (como `semPf`).
- Bot: para cada vaga com papéis, fica no padrão salvo se outro papel render ≥ 2 pontos a mais em `notaNoPapel`; nunca dois Apoiadores no mesmo time com um DMC só ou nenhum (o segundo volta ao Fixo/padrão).

- [ ] **Step 1: Teste que falha** — tática sem `papeis` carrega com `papel` nulo em todas as vagas; `papeis` com `"invertido"` no DR passa; `"fixo"` numa vaga MC vira nulo; `"xyz"` vira nulo; `calcularPartida` com `temporada: 0` e papéis na tática dá o mesmo placar e narração que sem papéis; bot com lateral de Passe/Criatividade muito altos e Desarme baixo escolhe `construtor` ou `invertido`; bot nunca devolve dois `apoiador` com menos de dois DMC.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** teste passa; `python ferramentas/empacotar_funcao.py`; `node ferramentas/testes.mjs`.
- [ ] **Step 5:** commit (com `supabase/functions` reempacotado).

### Task 5: Trocar de papel custa entrosamento (SQL 164) — Modelo: Opus

**Files:**
- Create: `supabase/164_papel_jogado.sql`
- Modify: `src/rodada.js` (devolve o papel de cada titular no resultado da partida), parte escrita à mão do fim de `ferramentas/empacotar_funcao.py` (onde a função chama `entrosar_partida`), `src/banco.js` (lê `papel_jogado` tolerando schema antigo)
- Test: `ferramentas/teste_papel_jogado_sql.mjs` (pglite, roda o SQL duas vezes)

**Interfaces:**
- Produces: coluna `jogadores.papel_jogado text`; RPC `marcar_papeis(p_partida bigint, p_papeis jsonb, p_jogos int)` (`[{id, papel}]`, só `service_role`): para quem tinha `papel_jogado` não nulo e diferente do novo, `entrosar = greatest(entrosar, p_jogos)`; grava o novo. Chamada depois de `entrosar_partida` (que já desconta um jogo).

Regra: papel nulo (T0, ou time sem papel) não grava nada, então nada muda na T0. Os jogos vêm de `CONFIG.papeis.entrosarTroca` (inicial 3), passados à RPC como `p_jogos`. Medido em 29/10 (8.000 jogos, 4-2-3-1): um zagueiro com 8 jogos para entrosar custa 1,7 ponto percentual de vitória, o mesmo que um zagueiro 3 pontos pior; com 3 jogos, nada mensurável. Teto da calibragem: a troca de um papel nunca custa mais que um quarto do ganho do ajuste certo (+7 a 8 pontos percentuais), porque o objetivo dos papéis é mudar a tática conforme o adversário. Trocar o titular por um reserva que marca mais não custa entrosamento (o entrosamento de hoje é só de quem chega ao clube e desconta por jogo do clube, jogando ou não).

- [ ] **Step 1: Teste que falha** — SQL roda duas vezes; jogador com `papel_jogado = 'fixo'` que joga `apoiador` fica com `entrosar = 3`; quem repete o papel não muda; quem tinha nulo só grava; `anon` não executa a RPC.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** escrever o SQL (cabeçalho: "Precisa do 86. Depois: republicar a função rodada") e a chamada na função.
- [ ] **Step 4:** teste passa; reempacotar; `node ferramentas/testes.mjs`.
- [ ] **Step 5:** commit.

### Task 6: Escolha na escalação e o desenho com e sem a bola — Modelo: Opus

**Files:**
- Modify: `src/ui-escalacao.js` (`daTatica`, `render`/`htmlGramado`, `renderEscolha`, `htmlMiniMapa`, `validar`, mudança de posição da vaga)
- Modify: `trem.css` (só se o chip do papel precisar de estilo novo)
- Test: verificação manual na página (`python -m http.server 8797`, `escalacao.html` local e Clube › Tática logado)

**Interfaces:**
- Consumes: `papeisDaPosicao`, `notaNoPapel`, `PAPEIS`, `PAPEL_PADRAO`, `avaliarZonas` (Task 2), `E.papeis`.
- Produces: `desenhoDoTime(esc11) -> { com: "3-2-5", sem: "4-5-1" }` exportado de `src/papeis.js` (conta cada titular de linha na linha D/M/A onde está o maior peso do mapa da fase; sem pontos do goleiro).

Regras de tela (memória do dono: um foco por tela, o campo; o resto a um clique):
- No campo, abaixo do nome de quem está numa vaga com papéis, uma linha pequena com o nome do papel; o padrão aparece apagado.
- Clicar no papel abre a escolha no painel de escolha que já existe (como capitão/armador): os papéis da posição, a nota do jogador em cada um, `faz` e `custa`. O nome local `PAPEIS` (capitão, armador…) do arquivo continua; importar o novo como `PAPEIS_DE_JOGO`.
- `E.papeis` acompanha `E.vagas`: trocar a posição de uma vaga, aplicar formação ou "escalar os melhores" zera o papel inválido.
- Minimapa ("Com a bola"/"Sem a bola", que já existe) ganha no título o desenho: "Com a bola · 3-2-5", "Sem a bola · 4-5-1".
- Na liga ao vivo antes da T1, a escolha aparece com o aviso de uma linha "Os papéis valem a partir da temporada 1"; a tela local mostra sempre.

- [ ] **Step 1:** teste do `desenhoDoTime` em `teste_papeis.mjs` (empate de peso entre linhas vai para a mais adiantada): 4-4-2 padrão → com e sem "4-4-2"; com os dois laterais `apoiador` → com a bola "2-4-4" e sem a bola "4-4-2". (Invertido e Construtor somam 55% na defesa com a bola e continuam contando atrás: o desenho em números só muda com o Apoiador; o minimapa mostra o resto.)
- [ ] **Step 2:** implementar a tela; abrir local e logado, escolher Invertido no DR, ver o minimapa mudar, salvar, recarregar e conferir que voltou.
- [ ] **Step 3:** print da escalação no celular e no PC para o dono.
- [ ] **Step 4:** commit.

### Task 7: Narração e calibragem — Modelo: Opus (+ simulações em paralelo)

**Files:**
- Modify: `src/motor.js` (textos dos lances em que o pivô ou o marcador tem papel não padrão)
- Create: `ferramentas/sim_papeis_laterais.mjs`
- Modify: `src/papeis.js` / `CONFIG.papeis` (valores ajustados)

**Interfaces:**
- Consumes: tudo acima.

Narração (só quando o papel não é o padrão, para a T0 não mudar): cruzamento de um Apoiador ("o lateral Apoiador chega ao fundo e cruza"); bola roubada no meio do lado pelas costas de um Apoiador ou Invertido ("contra-ataque pelas costas do lateral que tinha subido"); Invertido vencendo duelo no centro do meio ("o lateral fecha por dentro e toca").

Calibragem (`sim_papeis_laterais.mjs [jogos]`, times iguais, 4-2-3-1 e 3-5-2, cada papel nos dois laterais contra o padrão):
- Vitória de cada papel contra o padrão entre 35% e 39% (padrão 37%): nenhum muda muito a chance de vencer.
- Proporções da spec (Aké/Frimpong/Zinchenko): Apoiador cruza ~10× e cria ~4× o Fixo; Invertido cria ~3× o Fixo quase sem cruzar e ganha mais duelos no meio; Fixo sofre menos chances pelo lado; Apoiador sofre mais contra-ataques pelo lado.
- Gols da liga com todos padrão: iguais aos de hoje (o mesmo jogo).
- Ajustar `CONFIG.papeis` e mapas iniciais até bater; registrar os números no comentário do CONFIG, como o resto do motor.

- [ ] **Step 1:** escrever o sim e rodar 6.000 jogos por papel.
- [ ] **Step 2:** ajustar e repetir até as metas; reempacotar.
- [ ] **Step 3:** `node ferramentas/testes.mjs`; `python ferramentas/publicar.py`; commit e push (a função rodada precisa ser republicada e o SQL 164 executado; nada muda na T0).
- [ ] **Step 4:** atualizar a página do plano (etapa 2 feita, números da calibragem) e a memória `plano-papeis`.

---

## Adendo de 30/10: transição, defesa de reserva e "ao perder a bola" — Modelo: Opus

**Por quê (medido em 30/10):** contra o padrão, o Apoiador vence 5 a 7 pontos percentuais a mais e o Construtor 3 a 4. A parte com a bola deles sai de graça porque o peso no fundo com a bola quase não conta no motor: o contra-ataque gera só 2,7% dos gols (real: 5,25% na conta estrita da Opta; 14 a 20% nos estudos de transição). A parte sem a bola do Apoiador ganha posse porque a defesa do meio entra no controle (compactação, a decidir depois da medição). Aprovado pelo dono em 30/10 ("pode seguir"; gostou do "ao perder a bola").

**Regra da liga:** tudo vale a partir da T1. `simularPartida(rng, casa, fora, { regrasT1 })`, com padrão `true`; `calcularPartida` passa `temporada >= PAPEIS_DESDE`. Com `false`, o jogo é o de hoje (300 partidas idênticas).

### Task 8: Regras da T1 e defesa de reserva
- `CONFIG.t1`: valores que só valem com `regrasT1` (`ataquesPorMinuto`, `contraAtaque.com/sem`, `reserva`), aplicados e restaurados dentro de `simularPartida`.
- Defesa de reserva do time = força de defesa que fica nas zonas D pelo mapa com a bola (`recalcular`: `t.reserva`). Ao perder a bola, a chance de contra-ataque do adversário vai por `(referência / reserva) ^ expoente`, com a referência na média das formações prontas.
- Teste: `regrasT1: false` = jogo de hoje; dois Apoiadores sofrem mais contra-ataques que dois Fixos com `regrasT1`.
- Meta: gols de contra-ataque perto de 10% dos gols, gols por jogo iguais aos de hoje (2,36 na conta de `conta.mjs`).

### Task 9: "Ao perder a bola" (instrução do time)
- `instr.aoPerder`: `"misto"` (hoje), `"pressionar"` (chance de retomar a bola na hora, na zona em que perdeu, pela defesa do time ali; se falhar, o contra-ataque deles fica mais provável; gasta mais energia), `"recompor"` (contra-ataque deles bem menos provável e sem pegar o time fora do lugar; em troca, menos posse).
- `rodada.js` valida (`um(I.aoPerder, ["misto", "pressionar", "recompor"], "misto")`); a escalação ganha o botão no grupo "Estratégia"; o bot fica no misto; vale só com `regrasT1`.

### Task 10: Recalibrar
- `sim_papeis_laterais.mjs` com as regras da T1: cada papel com a vitória entre 35% e 39%; se ainda passar, entra a compactação na posse.
- `sim_formacoes.mjs` com as regras da T1: formações dentro das metas de hoje.
- Medir de novo o valor de cada posição (+6 em tudo) e levar ao dono (meta de 70% em aberto).
