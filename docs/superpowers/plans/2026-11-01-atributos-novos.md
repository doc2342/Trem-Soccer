# Passe longo, Movimentação e Decisões: plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:executing-plans` (decidido para este plano, ver "Modelo para executar"). Os passos usam caixas (`- [ ]`).

**Objetivo:** criar os 3 atributos aprovados pelo dono em 31/10, com a liga real recebendo os valores na virada T0→T1 e a T0 sem mudar nada. O treino pela função fica para depois dos papéis (dono, 01/11).

**Arquitetura:** os 3 entram no fim do vetor `at` (índices 22, 23, 24). O tamanho do vetor é a trava: `at` com 22 lê os pesos e o foco de hoje, `at` com 25 lê os da T1. Assim o histórico gravado com 22, a T0 e os amistosos da T0 continuam certos sem ninguém perguntar a temporada. Uma função só, `atributosNovos(j)`, serve ao gerador, à entrega na virada e ao motor (quando um jogador de 22 entra em jogo com as regras da T1).

**Tecnologia:** JS puro, Postgres (Supabase), pglite nos testes de SQL.

**Spec:** não há spec própria. Fontes: memórias `atributo-passe-longo`, `rebote-gol-contra-olimpico`; `docs/superpowers/specs/2026-11-01-atributos-fontes-decisao.md`; `docs/superpowers/specs/2026-10-31-grade-5x5-design.md` (7.5 e 12b); `docs/superpowers/plans/2026-10-31-grade-5x5.md` (Tarefa 12, Passo 1b).

## Modelo para executar

- **Principal: Sonnet 5.5, inline, sem subagente por tarefa** (`superpowers:executing-plans`). As tabelas e as assinaturas estão decididas aqui; as tarefas são mecânicas e dependem umas das outras em cadeia. Memória `inline-sem-subagentes`.
- **Tarefa 5 (motor): Opus 5.5.** Mexe em atacarNaGrade, e erro ali muda a calibragem sem quebrar teste.
- **Revisão final: um subagente Opus 5.5** em todo o lote. Foco: a T0 e a seção "Foco da revisão".

## Restrições globais

- Tudo em português do Brasil: código, comentários, interface, commits. Mensagem de commit por arquivo (`git commit -F`), nunca inline.
- **T0 intacta:** `ferramentas/teste_t0_intacta.mjs` passa **sem mudar uma linha**, nos dois hashes. Se ele quebrar, o erro é da implementação; não trocar o hash.
- Sem `Math.random()` em caminho do motor. Sorteios novos usam RNG próprio semeado, como `sortearPeFraco`, sem consumir o RNG do gerador nem o da partida.
- `src/*.js`: um `import { … } from "./x.js";` por linha e um `export const|let|function` por declaração. Nada de editar `supabase/functions/*/index.ts` à mão (`python ferramentas/empacotar_funcao.py`).
- SQL idempotente, com cabeçalho do que faz, do que precisa e do que fazer depois.
- A ordem do vetor nunca muda: `treino.c` e `treino_pts` guardam índices.

## O que foi levantado: quem lê os atributos

| Onde | O que faz hoje | O que acontece com 25 | Decisão |
|---|---|---|---|
| `jogadores.at` (`01_esquema.sql:47`) | CHECK `= 22` | toda gravação de 25 falha | CHECK `in (22, 25)` (Tarefa 3) |
| `aplicar_treino` (`163_no_teto.sql:22`) | `where` exige 22 em `at` e `pts` | **descarta sem erro: o treino para e ninguém avisa** | aceitar 22 ou 25, `pts` do mesmo tamanho (Tarefa 3) |
| `treinar` (`treino.js:193`) | `pts` tem o tamanho de `ATRIBUTOS` | na T0 sairia `at` 22 + `pts` 25 → mesmo descarte | `pts` no tamanho de `at` (Tarefa 2) |
| `partilha`, `focoAutomatico`, `focoDoJogador` | índices de `ATRIBUTOS` | ponto em atributo que não existe → `NaN` no banco | só índices `< at.length`; complementar automático por `pesosDe` (Tarefa 2) |
| `sortearAtributos`, `aplicarPerfil` (`gerador.js:25,42`), `garotoDaEscolinha` (`ligabase.js:32`) | `ATRIBUTOS.map` com sorteio | mais sorteios → **muda todo jogador gerado e a trava da T0** | usar `ATRIBUTOS_DA_T0` (Tarefa 1) |
| `notaBruta` (`modelo.js:104`) | `PESOS` | `at` de 22 com peso novo → `NaN` no histórico e nos revelados | `pesosDe(at, papel)` pelo tamanho (Tarefa 1) |
| `notaNoPapel` (`papeis.js:104`), `bot.js:30` | pesos da ficha | as fichas não têm os novos | nada agora: entram na etapa dos papéis |
| `PESOS[...]` nas telas (`jogador.html:75`, `elenco.html:92`, `ui-escalacao.js:602`, `jogo.html` no `conta` de 2214/2235) | destaca o que conta | destaque errado | `pesosDe` (Tarefa 6) |
| Laços `ATRIBUTOS.map` nas telas (`jogo.html:2232, 2246, 4450, 4480, 4491`; `jogador.html:94, 141`; `ui-escalacao.js:602`; `elenco.html:89`) | mostram `j.at[k]` | "undefined" na T0 | `atributosDe(j)` (Tarefa 6) |
| Radar (`ui-trem.js:96`) | média por grupo | já filtra `null` | nada |
| `jogador.html:80` | soma contra a foto do início | "+60 pontos" se a foto vier antes da entrega | entrega antes de `marcarInicioDaTemporada` (Tarefa 4) |
| `historico` de jogadores (84), `revelados` (64), foto do início | `at` antigo | ficam com 22 | nada: `notaBruta` lê pelo tamanho |
| `salarioDeMercado`, `mercadobots`, `bot.js`, `forcaDoOnze` | só nota | automático | nada |
| `FISICOS`, `DE_GOLEIRO` (`virada.js`) | por grupo | `mov` e `dec` são `men`, `plo` é `tec`: não entram | nada |
| `ajusteDoPe` (`modelo.js:120`) | multiplica `pas` e `lon` | `plo` em `at` de 22 gravaria `NaN` no índice 22 | não mexer (ver "Fica de fora") |
| `bot.js:102`, `motor.js:1249` (falta), chute de longe | `lon` | é chute | nada: `lon` continua o Chute de longe |
| `motor.js:369` | `lon × 0,5` na ameaça das faixas 4–5 | é chute | nada |

**Valor (preço do jogador):** não há tabela própria; salário e multa vêm da nota. Como a entrega mantém a nota, o valor não salta.

## Decisões

**Os valores (nomes e chaves):** `plo` Passe longo, grupo `tec`, área de treino Meio. `mov` Movimentação, grupo `men`, área Tática. `dec` Decisões, grupo `men`, área Tática.

**Pesos da T1 (`PESOS_T1`, cada linha soma 100):**

```js
GK:    { ref: 22, enc: 18, um: 16, pos: 16, com: 12, dec: 4, plo: 4, vel: 4, for: 4 },
DC:    { mar: 18, des: 18, pos: 14, cab: 14, for: 10, vel: 8, com: 5, dec: 5, plo: 5, pas: 3 },
SW:    { pos: 22, des: 14, vel: 14, mar: 10, com: 10, pas: 6, plo: 6, dec: 6, cab: 6, dom: 4, cri: 2 },
LAT:   { des: 18, mar: 16, vel: 16, pos: 12, cru: 10, res: 8, pas: 6, com: 4, dec: 4, mov: 3, for: 3 },
ALA:   { vel: 14, cru: 16, res: 12, des: 12, dri: 8, mov: 6, mar: 8, pos: 8, pas: 8, dec: 4, dom: 4 },
DMC:   { des: 18, pos: 16, mar: 12, pas: 10, dec: 12, plo: 6, for: 6, res: 8, dom: 4, agr: 4, cab: 2, equ: 2 },
MC:    { pas: 18, cri: 12, dom: 10, dec: 12, plo: 8, pos: 8, equ: 4, res: 8, des: 8, lon: 4, vel: 4, dri: 4 },
AMC:   { cri: 18, pas: 14, dom: 12, lon: 10, dri: 12, fin: 8, dec: 10, mov: 6, pos: 4, vel: 6 },
MLAT:  { cru: 16, pas: 12, vel: 12, dom: 8, cri: 8, dri: 10, res: 8, mov: 6, dec: 6, plo: 4, pos: 4, des: 6 },
AMLAT: { dri: 16, cri: 12, cru: 12, vel: 12, pas: 8, dom: 8, lon: 8, fin: 8, mov: 8, dec: 6, pos: 2 },
PONTA: { dri: 18, vel: 18, cru: 12, fin: 12, dom: 8, mov: 10, dec: 4, cri: 4, pos: 4, pas: 4, res: 4, lon: 2 },
FC:    { fin: 22, dom: 14, vel: 12, dri: 10, mov: 12, pos: 8, dec: 4, cri: 6, pas: 4, lon: 4, cab: 4 },
SC:    { fin: 22, cab: 18, for: 16, mov: 10, pos: 10, dom: 8, vel: 4, lon: 2, dec: 4, agr: 3, pas: 3 },
```

**Valores iniciais de quem já existe** (`atributosNovos(j, chave = j.id)`). `n` = nota do jogador na posição principal; `[a, b, c]` por posição; RNG próprio semeado pela chave, sorteios nesta ordem:

```
plo = 0,6 × (n + a) + 0,4 × Passe + 0,15 × (idade − 25) + normal(0; 4)     (goleiro: n + a + normal(0; 7))
mov = n + b + normal(0; 4)
dec = n + c + 0,3 × (idade − 25) + normal(0; 3,5)
```

```js
GK: [-10, -24, -3],  DC: [-5, -16, -4],  SW: [-3, -14, -2],  DR: [-8, -4, -8],  DL: [-8, -4, -8],  WBR: [-6, -3, -8],  WBL: [-6, -3, -8],
DMC: [-2, -12, -2],  MC: [0, -6, 0],  AMC: [-3, -2, 0],  MR: [-9, -3, -6],  ML: [-9, -3, -6],  AMR: [-6, -1, -6],  AML: [-6, -1, -6],
RW: [-8, 0, -6],  LW: [-8, 0, -6],  FC: [-12, 0, -10],  SC: [-14, 0, -10],
```

Depois, **ajuste da nota:** em rodízio, sobe ou desce 1 nos atributos novos que pesam na posição principal até a nota por `PESOS_T1` ficar a 0,1 da nota antiga, sem mover nenhum atributo mais de 6 do valor sorteado. Cada resultado fica entre 1 e 50.

**Medido nos 2.269 jogadores reais (`dados.json`, 01/11):**

| Medida | Resultado |
|---|---|
| Nota principal sem o ajuste | média −0,06; 98% entre −1,22 e +1,16 |
| Nota principal com o ajuste | média −0,01; só 74 jogadores passam de 0,3, 15 passam de 0,6, máximo 1,14 |
| Salário de mercado | média −0,1%; 98% entre −5,8% e +5,4%; máximo +14,6% |
| Posição natural secundária (444 casos) | média +0,11; 98% entre −0,79 e +1,44 |

| Média por posição | Passe longo | Movimentação | Decisões | Hoje: `lon` / Velocidade / proxy da Decisão |
|---|---|---|---|---|
| Goleiro | 19,0 (desvio 7, máx. 34) | 7,0 | 25,9 | 6,3 / 21,7 / 14,0 |
| Zagueiro | 28,5 | 16,6 | 31,2 | 20,3 / 30,8 / 22,3 |
| Lateral direito | 25,7 | 27,9 | 24,9 | 21,0 / 37,4 / 22,2 |
| Volante | 33,4 | 20,8 | 32,2 | 20,9 / 26,8 / 25,8 |
| Meio-campista | 33,8 | 26,8 | 32,7 | 30,8 / 26,2 / 34,1 |
| Meia-atacante | 32,9 | 29,4 | 31,2 | 30,8 / 26,6 / 30,8 |
| Meia direita | 31,4 | 31,6 | 28,9 | 21,5 / 33,4 / 29,4 |
| Ponta direita | 25,5 | 32,3 | 27,3 | 24,6 / 37,2 / 25,2 |
| Atacante móvel | 23,6 | 33,4 | 23,8 | 25,2 / 37,7 / 26,0 |
| Centroavante | 18,6 | 30,4 | 20,0 | 22,0 / 23,4 / 20,2 |

A ordem de Decisões bate com a da memória: meias > zagueiros > pontas > laterais > atacantes. O goleiro ganha espalhamento real, então um Ederson passa a existir. O meia de lado (MR/ML) deixa de ser o melhor lançador, que era o defeito de usar o Passe. Com tudo aplicado, `plo` fica com correlação 0,79 com Passe e 0,55 com `lon`.

**Conferido com o FotMob** (Premier 2025/26 e Brasileirão 2025, jogadores com 900+ minutos; `docs/superpowers/specs/2026-11-01-atributos-fontes-decisao.md`): o zagueiro é quem mais lança e o lateral é quem menos acerta, por isso zagueiro acima do lateral em Passe longo e com peso 5. O lateral está entre os que mais correm em sprint, por isso Movimentação um pouco maior. O passe melhora com a idade (Barça: acima de 30 anos, 3–5% a mais de acerto), daí o termo de idade.

**Sem mudar a T0, por construção:**
- O gerador continua saindo com 22 por padrão; só quem nasce para a T1 pede os 3 (`novos: true`).
- A entrega na liga real roda **dentro da virada**, depois de `virarTemporada` e antes de `marcarInicioDaTemporada`. Até ali, todo jogador da liga tem 22.
- Com 22, nada muda: nota, foco, treino, tela. Os dirigentes só veem os 3 atributos na T1.
- **Amistoso da T0 já joga com os 3 atributos:** usa as regras da T1 com jogador de 22, e o motor calcula os valores só para o jogo (`jog.at`), sem gravar e sem mostrar; `j.at` não muda. É a mesma função da entrega, então o amistoso antecipa a T1. Vale desde a publicação do código. Amistoso antigo pode rever diferente: decisão do dono em 31/10 (spec, 2a).

**Treino (dono, 01/11: a revisão fica para depois dos papéis):** nesta entrega ele só precisa continuar certo. Os 8 focos de `FOCOS` não mudam. Para quem tem 25, o complementar automático passa a ler `pesosDe`, então os atributos novos que mais pesam na posição entram sozinhos nele; o dirigente também pode escolhê-los no complementar. `plo` na área Meio; `mov` e `dec` na Tática.

**Decisão, Passe longo e Movimentação no motor (só grade):**

| Atributo | Leitura | Antes |
|---|---|---|
| Decisões | `decisao(at)` = `at[IDX.dec]` | média de Criatividade e Trabalho em equipe |
| Decisões | na escolha do passo (`motor.js:1499`), `decisaoSobPressao(dec, P, G)` = `dec − G.decisao.pressao × P × (1 − dec / 50)`, com `decisao.pressao: 5` e `P` = pressão do adversário (0 a 2): dec 20 perde 6, dec 40 perde 2 com pressão 2 | sem efeito da pressão |
| Decisões | defesa, só na grade: em `habilidadeDefesa`, `pos` vira `0,75 × pos + 0,25 × dec` (dar o bote, atrasar ou recuar) | Posicionamento |
| Decisões | saída do goleiro (`motor.js:1181`), só na grade: `media(um, vel, pos, dec)` | `media(um, vel, pos)` |
| Passe longo | virada, inversão e bola longa (`motor.js:1449, 1492, 1504`), goleiro incluído, sempre `plo − 25`; reposição (`motor.js:1470`) com `plo`, `reposicao.referencia` 12 → 19 | `lon`, ou Passe do goleiro |
| Movimentação | `chegada(at)` = média de Velocidade e Movimentação no passe no espaço (`1375`, `1382`, `1510`) | Velocidade |
| Movimentação | quem pega o rebote: peso `x.w × mov` (`1161`) | `x.w` |
| Movimentação | quem aparece entrelinhas: `x.w × média(dom, mov)` (`1381` e o sorteio de quem recebe) | `x.w × dom` |
| Movimentação | atacante no cruzamento: `mov` no lugar de `pos` em `nos` (`712`); a defesa segue com `pos` | `pos` |

A defesa na corrida (`velDef`) continua só Velocidade: a corrida bem medida vence a mais rápida.

**Regra:** atributo com peso na nota tem que ter efeito no jogo. Por isso Decisões entrou na defesa e no goleiro, que quase nunca escolhem passo. O risco por zona e a reciclagem já existem; a queda sob pressão cobre a Compostura, que segue sem atributo (fontes: `2026-11-01-atributos-fontes-decisao.md`).

**Fica de fora:**
- **Treino pela função:** depois de todos os papéis (dono, 29/10 e 01/11). Inclui decisão que melhora jogando.
- Pé trocado no Passe longo: entra junto com uma revisão de `ajusteDoPe`, se a calibragem pedir.
- Mancha de contra-ataque (Movimentação): etapa Atacantes, pontas e zagueiros.
- Pesos dos 29 papéis com os atributos novos, inclusive os 4 de lateral que já existem: etapa dos papéis.
- Altura, Antecipação, Equilíbrio: seguem na Tarefa 12, Passo 1b.
- Ajuste fino: Tarefa 12. Este plano só mede o que mudou.
- Gol contra: a chance por cruzamento segue para a Tarefa 12 (memória `rebote-gol-contra-olimpico`).

## Ordem de entrega

1. SQL `172_atributos_novos.sql`: pode rodar com a T0 em andamento; aceita 22 e 25.
2. Republicar `rodada` e `mercado`; publicar o site. Com jogadores de 22, tudo igual à T0.
3. Na virada T0→T1 o admin entrega os 3 sozinho, e `saude.mjs` confere: nenhum jogador com 22.

**O SQL 172 tem que estar no ar antes da virada.** Sem ele, a entrega falha com erro, e o admin mostra o erro (Tarefa 4).

## Foco da revisão

1. **Treino com 25 gravado no banco:** `aplicar_treino` com `at` 25 e `pts` 22 ou 25 não pode descartar sem erro. Teste na Tarefa 3.
2. **Virada pela metade:** a entrega falha no meio do lote; repetir deve entregar só a quem falta, sem somar 6 atributos. Teste na Tarefa 3; botão na Tarefa 4.
3. **Jogador de 22 na T1** (bot novo esquecido, garoto da escolinha, amistoso): joga sem `NaN`. Teste na Tarefa 5.
4. **Foco salvo com atributo do goleiro ou índice inválido em `treino.c`:** continua filtrado; jogador de 22 nunca recebe ponto em índice ≥ 22. Teste na Tarefa 2.
5. **Foco salvo na T0 e jogador que vira 25 na virada:** o foco salvo continua valendo e o complementar não perde índice. Teste na Tarefa 2.

---

### Tarefa 1: Modelo e gerador

**Arquivos:**
- Modificar: `src/modelo.js`, `src/gerador.js`, `src/ligabase.js:32`
- Criar: `ferramentas/teste_atributos_novos.mjs`

**Interfaces:**
- Produz, em `modelo.js`:
  - `ATRIBUTOS` com 25; `ATRIBUTOS_DA_T0` (os 22 primeiros); `N_DA_T0 = 22`; `ATRIBUTOS_DESDE = 1`
  - `PESOS_T1`; `AJUSTE_INICIAL` (tabela `[a, b, c]`)
  - `temNovos(at) -> boolean`; `pesosDe(at, papel) -> objeto de pesos`; `atributosDe(j) -> ATRIBUTOS.slice(0, j.at.length)`
  - `atributosNovos(j, chave = j.id) -> [plo, mov, dec]`; `comNovos(j) -> at de 25` (devolve `j.at` se já tem)
- Produz, em `gerador.js`: `gerarJogador(rng, { …, novos = false })`, `gerarElenco(rng, { …, novos = false })`, `gerarOnze` idem; com `novos`, `at` sai com 25, chave `j.nome_completo + j.at`, depois do `pf` e sem consumir `rng`.

- [ ] **Passo 1: Escrever o teste que falha**

```js
// PESOS_T1: cada linha soma 100, todo papel de PESOS existe
// ATRIBUTOS.slice(0, 22) === os mesmos k de hoje, na mesma ordem; IDX.plo 22, IDX.mov 23, IDX.dec 24
const at22 = gerarOnze(criarRng(7), FORMACOES["4-4-2"], { nivel: 30, nomes })[3].j.at;
assert.strictEqual(at22.length, 22);
assert.strictEqual(notaBruta(at22, "MC"), notaBrutaAntiga(at22, "MC")); // recalculada no teste com PESOS
// mesma semente, novos: true → os 22 primeiros iguais e 25 no total
assert.deepStrictEqual(com.j.at.slice(0, 22), sem.j.at);
// atributosNovos: determinística, entre 1 e 50, |nota T1 − nota antiga| ≤ 0,1 quando o ajuste de 6 basta, e nenhum sai mais de 6 do sorteio
// comNovos não altera j.at; comNovos de quem tem 25 devolve o mesmo vetor
// dados.json, se existir: média de |diferença de nota| < 0,2 e no máximo 2% acima de 0,3
```

- [ ] **Passo 2: Rodar e ver falhar:** `node ferramentas/teste_atributos_novos.mjs` → falha porque `ATRIBUTOS` tem 22.
- [ ] **Passo 3: Implementar.**
  - Acrescentar `import { criarRng } from "./rng.js";` em `modelo.js` (`rng.js` não importa nada) e os 3 no **fim** de `ATRIBUTOS`.
  - `notaBruta` lê `pesosDe(atributos, POSICOES[pos].papel)`.
  - Semente de `atributosNovos`: `[...String(chave)].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0) | 0, 172)`. O sorteio usa os valores e a tabela da seção "Decisões"; a nota antiga é `notaBruta(j.at, j.pos)` com os 22.
  - `sortearAtributos` e `aplicarPerfil` iteram `ATRIBUTOS_DA_T0`; `garotoDaEscolinha` idem.
  - Atualizar o comentário "22 atributos" do topo de `modelo.js`.
- [ ] **Passo 4: Rodar:** `node ferramentas/teste_atributos_novos.mjs` e `node ferramentas/teste_t0_intacta.mjs` → ok, sem tocar nos hashes.
- [ ] **Passo 5: Commit.**

### Tarefa 2: Treino sem quebrar

**Arquivos:**
- Modificar: `src/treino.js`
- Testar: `ferramentas/teste_treino_25.mjs` (criar)

**Interfaces:**
- Consome: `pesosDe` (Tarefa 1).
- Produz: `focoAutomatico(pos, at = null) -> { p, c }`: com `at` de 25, o complementar sai de `pesosDe(at, papel)`; sem isso, igual a hoje. `focoDoJogador(j)` e `partilha(j)` passam `j.at`.

- [ ] **Passo 1: Escrever o teste que falha**

```js
// jogador de 22: partilha sem chave ≥ 22; treinar devolve at e pts com 22; focoAutomatico igual ao de hoje
// jogador de 25: treinar devolve at e pts com 25; pts antigo de 22 vira 25 sem perder valor
// MC de 25: complementar automático = dec, plo, res (maiores pesos fora do foco "meia", ordem de declaração nos empates)
// foco salvo com c = [22] em jogador de 22: índice cai fora; em jogador de 25: vale
// foco salvo na T0 continua igual depois de o jogador ganhar os 3
// jogador de linha nunca recebe ref/um/enc; treino.c com índice 40 cai fora
```

- [ ] **Passo 2: Rodar e ver falhar:** `node ferramentas/teste_treino_25.mjs`.
- [ ] **Passo 3: Implementar.** `AREAS.mei.at` ganha `plo`; `AREAS.tat.at` ganha `mov`, `dec`. `focoDoJogador`: filtro `i < j.at.length`. `treinar`: `pts = at.map((_, i) => …)`. `partilha`: índices `< j.at.length`, inclusive no rateio dos pesos quando o foco está cheio, lendo `pesosDe`.
- [ ] **Passo 4: Rodar:** `python ferramentas/empacotar_funcao.py` e `node ferramentas/testes.mjs` → tudo passa.
- [ ] **Passo 5: Commit.**

### Tarefa 3: Banco

**Arquivos:**
- Criar: `supabase/172_atributos_novos.sql`, `ferramentas/teste_atributos_novos_sql.mjs`

**Interfaces:**
- Produz: `aplicar_atributos_novos(p_lista jsonb) returns int`; `p_lista`: `[{ "id": 123, "novos": [plo, mov, dec] }]`. Só administrador (`eh_admin()`, senão `raise exception`). Devolve quantos recebeu.

- [ ] **Passo 1: Escrever o teste que falha** (mesmo molde de `teste_no_teto_sql.mjs`; executa o arquivo duas vezes)

```js
// at 22 + pts 22 → aplicar_treino grava; at 25 + pts 25 → grava; at 25 + pts 22 → não grava; at 23 → não grava
// aplicar_atributos_novos: at 22 vira 25 com os 3 no fim; treino_pts 22 vira 25 com zeros; treino_pts null continua null
// repetir a mesma lista: at continua 25, devolve 0
// sem ser admin: erro
// insert com at 22 e com 25 passa; com 24 falha no CHECK
```

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Escrever o SQL.** Cabeçalho: "Precisa do 163. Pode rodar com a T0 em andamento. Depois: republicar `rodada` e `mercado`, publicar o site." Conteúdo:
  - `alter table jogadores drop constraint if exists jogadores_at_check;` e `add constraint jogadores_at_check check (array_length(at, 1) in (22, 25));`
  - `aplicar_treino`: corpo igual ao do 163; o `where` passa a `jsonb_array_length(x.at) in (22, 25) and jsonb_array_length(x.pts) = jsonb_array_length(x.at)`.
  - `aplicar_atributos_novos`: `security definer`, `set search_path = public`, `where array_length(at, 1) = 22`; `treino_pts = case when treino_pts is null then null else treino_pts || array[0,0,0]::smallint[] end`. `revoke` de `public, anon`; `grant` a `authenticated`.
- [ ] **Passo 4: Rodar:** `node ferramentas/teste_atributos_novos_sql.mjs` → ok.
- [ ] **Passo 5: Commit.**

### Tarefa 4: Virada e quem gera jogador

**Arquivos:**
- Modificar: `src/virada.js:174`, `src/base.js:42,60`, `ferramentas/empacotar_funcao.py:544`, `admin.html:137,480,873,747`, `src/banco.js`, `ferramentas/saude.mjs`
- Testar: `ferramentas/teste_atributos_novos.mjs`

**Interfaces:**
- Consome: `novos` (Tarefa 1), `aplicar_atributos_novos` (Tarefa 3).
- Produz: `entregaDosAtributos(jogadores) -> [{ id, novos }]`, pura, em `virada.js` (só quem tem 22; `id` numérico; chave `j.id` no formato `"j123"`); `darAtributosNovos(ligaId) -> quantos` em `banco.js`.

- [ ] **Passo 1: Escrever o teste que falha**

```js
// entregaDosAtributos: quem tem 25 fica de fora; lista vazia → []
// jovem da virada T0→T1 (planejarVirada com liga.temporada = 0): plano.novos com 25; plano.jogadores com 22
// jovensDaBase: temporada 0 → 22; temporada 1 → 25
```

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Passar `novos` em quem gera.** `virada.js:174`: `novos: nova >= ATRIBUTOS_DESDE`. `base.js`: `novos: temporada >= ATRIBUTOS_DESDE`. `empacotar_funcao.py:544`: pela temporada da liga. `admin.html`: `elencoNovo` pela `temporada`; 480 e 873 pela temporada da liga. Amistoso e telas de teste ficam em 22: o motor completa.
- [ ] **Passo 4: Entrega.** `darAtributosNovos`: lê `id, pos, at, idade` de **todos** os jogadores, com `range` de 1.000 como em `banco.js:473` mas sem o filtro de clube (livres, guardados e juvenis entram), e chama a RPC em lotes de 500. Em `admin.html`, entre `ajustarJanelaFinal` e `marcarInicioDaTemporada`, quando a virada leva à temporada `ATRIBUTOS_DESDE`: chamar dentro de `try`; o erro entra no texto final ("Atributos novos não entregues: … (o 172 já foi executado?). Depois use o botão."), sem parar a virada. Botão "Entregar atributos novos" no painel, que repete e refaz a foto do início.
- [ ] **Passo 5: Conferência.** `saude.mjs`: linha `== ATRIBUTOS · N com 22, M com 25`, e aviso a partir da T1 se N > 0.
- [ ] **Passo 6: Rodar:** `python ferramentas/empacotar_funcao.py`, `node ferramentas/testes.mjs` → tudo passa; `node ferramentas/saude.mjs .` mostra 2.269 com 22 ou o número do dia.
- [ ] **Passo 7: Commit.**

### Tarefa 5: Motor (Opus)

**Arquivos:**
- Modificar: `src/grade.js:70`, `src/motor.js` (linhas da tabela "Decisão, Passe longo e Movimentação no motor")
- Testar: `ferramentas/teste_grade.mjs:40`, `ferramentas/teste_grade_motor.mjs`, `ferramentas/teste_atributos_motor.mjs` (criar)

**Interfaces:**
- Consome: `comNovos`.
- Produz: `decisao(at) -> at[IDX.dec]`; `decisaoSobPressao(dec, pressao, V) -> número`; `chegada(at) -> média de vel e mov`, todas em `grade.js`.

- [ ] **Passo 1: Escrever o teste que falha**

```js
// jogo com regras da T1 e todos de 22: nenhum NaN em estat, narração nem jogadores; j.at continua com 22
// mesma semente, onzes de 22 × os mesmos com comNovos → placar igual (o motor completa igual)
// com a nota principal igual, 300 jogos: +12 em plo no time → mais bolas longas ganhas (estat.grade.longas / aereos)
// decisaoSobPressao(20, 2, G) === 14; (40, 2, G) === 38; pressão 0 não muda nada
// habilidadeDefesa com CONFIG.grade falso não lê dec: at de 22 dá número, igual ao de hoje
```

No teste de grade: `decisao` lê `at[IDX.dec]`; trocar a asserção da linha 40 de `teste_grade.mjs` para isso.

- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Vetor do jogo.** Em `motor.js:455`, trocar a origem: `const base = CONFIG.grade ? (jog.cheio ??= comNovos(jog.j)) : jog.j.at; jog.at = base.map(v => v * f);`. Fora da grade, nada muda.
- [ ] **Passo 4: Trocar as leituras** da tabela. `decisao: { base: 1.5, inclinacao: 1.5, pressao: 5 }` e `reposicao.referencia: 19` em `gradeValores`, e corrigir o comentário das linhas 275–276, que diz que o goleiro não tem Passe longo.
- [ ] **Passo 5: Rodar:** `node ferramentas/teste_t0_intacta.mjs` (os dois hashes iguais), `node ferramentas/testes.mjs` → tudo passa.
- [ ] **Passo 6: Medir.** `node ferramentas/sim_grade.mjs 3000` antes (commit anterior, com `git worktree` ou guardando a saída da Tarefa 4) e depois. Anotar gols, passes, bola longa, enfiadas, rebote na régua. **Se os gols saírem de 2,48–2,88, não ajustar aqui:** registrar para a Tarefa 12.
- [ ] **Passo 7: Commit.**

### Tarefa 6: Telas e guia

**Arquivos:**
- Modificar: `jogo.html`, `jogador.html`, `elenco.html`, `src/ui-escalacao.js`, `guia.html`

**Interfaces:**
- Consome: `atributosDe`, `pesosDe`.

- [ ] **Passo 1: Laços.** Trocar `ATRIBUTOS.map` por `atributosDe(j).map` nas linhas da tabela do levantamento. O índice continua certo porque é `slice` do começo.
- [ ] **Passo 2: Destaque.** Trocar `PESOS[POSICOES[p].papel]` por `pesosDe(j.at, POSICOES[p].papel)`.
- [ ] **Passo 3: Conferir a tela de treino (`jogo.html:4423-4521`):** os laços do Passo 1 cobrem o complementar; os focos seguem os mesmos 8.
- [ ] **Passo 4: Guia.** Explicar os 3 atributos em uma frase cada. `elenco.html:37,121` e `README.md:11`: "22 atributos" → "25 atributos".
- [ ] **Passo 5: Conferir no navegador.** `python -m http.server 8797`: `elenco.html` com jogador gerado (22) sem "undefined"; ficha e treino logado com jogador da liga (22) iguais a hoje. Forçar `at` de 25 no console e conferir ficha e treino. Print para o dono (memória `ritmo-visivel`).
- [ ] **Passo 6: Rodar `node ferramentas/testes.mjs`; commit.**

### Tarefa 7: Fechamento

**Arquivos:**
- Criar: `ferramentas/sim_atributos_novos.mjs`, `docs/superpowers/specs/2026-11-01-atributos-novos-medicao.md`
- Modificar: `docs/superpowers/specs/2026-10-31-grade-5x5-design.md:27,124`, `docs/superpowers/plans/2026-10-31-grade-5x5.md` (Tarefas 9c e 12)

- [ ] **Passo 1: Valor de cada atributo.** `sim_atributos_novos.mjs [jogos]`: mesmo onze contra si, com +6 em `plo`, `mov` ou `dec` por linha (defesa, meio, ataque), no molde de `sim_valor_posicao.mjs`; saldo de xG. **Critério:** Decisões tem que render na defesa e no volante, e nenhum dos 3 pode dar zero em todas as linhas (senão o atributo não faz nada) nem valer mais que +6 em Passe na mesma linha.
- [ ] **Passo 2:** gravar a medição: tabelas da Tarefa 5, Passo 6, e do Passo 1. Avisar o dono (memória `avisar-atributo-novo`) se alguma função ainda pedir atributo.
- [ ] **Passo 3: Corrigir os documentos.** Spec: tirar Decisões e Movimentação da caixinha; Decisão = atributo. Plano da grade: goleiro com Passe longo; Tarefa 12, Passo 1b, "Decisões e Movimentação já criados"; Tarefa 12, régua nova por posição, com a tabela do FotMob das fontes (bolas longas, acerto, passes certos, interceptações, recuperações). Goleiro: FotMob não lista bola longa.
- [ ] **Passo 4: Revisão final** (subagente Opus 5.5, foco na T0 e na seção "Foco da revisão"). Corrigir o que achar.
- [ ] **Passo 5: Publicação fica para a Tarefa 13 da grade**, junto com o motor. Acrescentar lá o passo "rodar `supabase/172_atributos_novos.sql` e republicar também `mercado`". Na virada, o admin faz o resto.
- [ ] **Passo 6: Memórias:** `atributo-passe-longo` (feito), `atributos-caixinha`, `grade-5x5`, e índice. Avisar "Hora de limpar" com o `/model` e o prompt seguinte (memória `avisar-hora-de-limpar`).
