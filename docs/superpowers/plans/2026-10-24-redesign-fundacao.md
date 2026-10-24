# Redesign · Plano 1: fundação e Central — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar uma chave (`data-visual="novo"`) que troca o visual para a gramática nova, com tokens claro/escuro, as peças compartilhadas, a página de referência das peças, a navegação em linha, o módulo de leituras e a Central refeita — sem mudar nada para quem não ligou a chave.

**Architecture:** O `atualiza.js` liga a chave a partir de `mo_visual` e injeta `trem.css` depois do `estilo.css`. As peças são funções puras em `src/ui-trem.js` que devolvem HTML em texto (como as telas já montam). As frases novas saem de `src/leituras.js`, puro e determinístico. No `jogo.html`, `telaClube` e `grupo(g)` desenham a navegação e a Central novas quando a chave está ligada e o caminho de hoje quando não.

**Tech Stack:** HTML + módulos ES nativos, CSS, testes `node:assert` em `ferramentas/teste_*.mjs` (rodados por `node ferramentas/testes.mjs`), Google Fonts (Archivo, Martian Mono).

**Spec:** `docs/superpowers/specs/2026-10-24-redesign-identidade-design.md` (referências visuais em `docs/superpowers/specs/2026-10-24-redesign-referencias/`, que são direção, não molde).

## Global Constraints

- Tudo em português do Brasil: código, comentários, identificadores, textos, commits.
- Sem build, sem framework, sem Tailwind. Fontes só do Google Fonts. Nada de `Math.random()` em `src/leituras.js`.
- Quem não ligou a chave vê exatamente o site de hoje (mesmo tema padrão, mesma tela).
- Vermelho da marca `#d7261e`, fixo em todo clube: traço dos rótulos, estação atual, foco. Cor do clube (`--ac`, do `atualiza.js`) só no botão da ação principal e no que é do clube.
- Derrota/erro/cartão num tom próprio, distinto do vermelho da marca.
- Archivo em todo o visual novo (títulos e números `font-stretch` 62–75%, peso 800–900; texto peso 300–500); Martian Mono só em documentos; números com `font-variant-numeric: tabular-nums`. Sem Barlow no visual novo.
- Claro é o padrão **com a chave ligada**; escuro como opção; "automático" continua existindo.
- Funcionar a 375 px sem rolagem lateral; contraste AA nos dois temas; foco visível; cor nunca é a única pista.
- Classes novas com prefixo `t-` (para não colidir com `estilo.css`); regras de elemento (`body`, `h1`, `button`, `table`…) no `trem.css` sempre sob `:root[data-visual=novo]`.
- Texto só quando fala do clube (regra 4 da spec): nenhuma frase nova explicando a tela.
- `atualiza.js`: a lista `ARQUIVOS` é refeita por `python ferramentas/publicar.py`; não editar à mão.
- Antes de um commit que vai ao ar: `python ferramentas/publicar.py`. Nenhum módulo deste plano entra nas funções do servidor (não mexer em `empacotar_funcao.py`).

## Review Focus

- **Clube sem jogo terminado ainda (início de temporada, temporada 0 do reinício):** a Central nova abre sem erro, sem Vestiário (ou com o bloco vazio escondido) e com a faixa mostrando a posição sem frase de distância. Teste em `teste_leituras.mjs` (Task 4) e conferência na Task 6.
- **Relatório antigo ou incompleto** (partida sem `estat`, sem `zonas`, sem `jogadores`): `leiturasDoVestiario` devolve só o que dá para afirmar, sem lançar erro. Teste na Task 4.
- **Texto do banco com `<`, `&`, `"`** (nome de clube, de jogador): toda peça escapa o que recebe como texto. Teste na Task 3.
- **Chave ligada numa página que não tem visual novo ainda** (`aovivo.html`, `guia.html`…): a página continua legível (o `trem.css` só muda o que tem prefixo `t-` ou está sob a chave, e as páginas sem peças novas não quebram). Conferência na Task 2.
- **Celular com "tela de PC" (`mo_tela=pc`)**: com a chave ligada, recebe a linha em cima, como no PC. Conferência na Task 5.

---

### Task 1: A chave e o tema

**Files:**
- Modify: `atualiza.js` (bloco do tema, linhas ~9–44)
- Modify: `ferramentas/publicar.py` (incluir os `*.css` da raiz na lista)
- Modify: `jogo.html` (aba Ajustes: interruptor do visual novo)
- Create: `trem.css` (vazio por enquanto, só o cabeçalho de comentário e o `@import` das fontes)
- Test: `ferramentas/teste_visual_chave.mjs`

**Interfaces:**
- Produces: atributo `data-visual="novo"` no `<html>` quando `localStorage.mo_visual === "novo"`; `window.moVisual(v)` com `v` = `"novo"` ou `""` (grava e recarrega); parâmetro de endereço `?visual=novo` / `?visual=velho` grava `mo_visual` e segue; `<link rel="stylesheet" href="trem.css">` acrescentado ao `<head>` só com a chave ligada. Com a chave ligada e `mo_tema` vazio, `data-tema="claro"`; `mo_tema="auto"` segue o aparelho (sem a chave, `""` continua sendo automático, como hoje).

- [ ] **Step 1: Escreva o teste**

`ferramentas/teste_visual_chave.mjs` carrega o texto do `atualiza.js` e roda num `vm` com `document`, `localStorage`, `sessionStorage`, `matchMedia`, `fetch`, `location` e `addEventListener` falsos (o suficiente para o IIFE rodar; `fetch` devolve uma promessa que nunca resolve). Casos:

```js
// sem chave, aparelho escuro, mo_tema vazio → como hoje
assert.equal(roda({ mo_tema: "" }, { claroDoAparelho: false }).raiz["data-tema"], "escuro");
assert.equal(roda({}, {}).raiz["data-visual"], undefined);
assert.equal(roda({}, {}).links.length, 0);
// com chave: claro por padrão, trem.css injetado uma vez
const r = roda({ mo_visual: "novo" }, { claroDoAparelho: false });
assert.equal(r.raiz["data-visual"], "novo"); assert.equal(r.raiz["data-tema"], "claro");
assert.deepEqual(r.links, ["trem.css"]);
// com chave: escuro escolhido e automático
assert.equal(roda({ mo_visual: "novo", mo_tema: "escuro" }, {}).raiz["data-tema"], "escuro");
assert.equal(roda({ mo_visual: "novo", mo_tema: "auto" }, { claroDoAparelho: false }).raiz["data-tema"], "escuro");
// pelo endereço
assert.equal(roda({}, { search: "?visual=novo" }).armazenado.mo_visual, "novo");
assert.equal(roda({ mo_visual: "novo" }, { search: "?visual=velho" }).armazenado.mo_visual, undefined);
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node ferramentas/teste_visual_chave.mjs`
Expected: FAIL (`data-visual` indefinido com a chave ligada).

- [ ] **Step 3: Implemente no `atualiza.js`**

Logo antes de `aplicarTema()`: ler `?visual=` de `location.search` e gravar/apagar `mo_visual`; `var novo = ler("mo_visual") === "novo"`; se novo, `setAttribute("data-visual", "novo")` e acrescentar o `<link>` ao `document.head`. Em `aplicarTema`, a regra de `claro`: `"claro"` → claro; `"escuro"` → escuro; `"auto"` → aparelho; `""` → claro com a chave, aparelho sem ela. `window.moVisual = function (v) { gravar("mo_visual", v); location.reload(); }`.

- [ ] **Step 4: Rode e veja passar**

Run: `node ferramentas/teste_visual_chave.mjs`
Expected: sem saída, código 0.

- [ ] **Step 5: `publicar.py` inclui os CSS da raiz**

Troque `["atualiza.js", "estilo.css"]` por `["atualiza.js"] + sorted(basename dos *.css da raiz)`. Run: `python ferramentas/publicar.py` e confira que `"trem.css"` aparece em `ARQUIVOS` no `atualiza.js`. Reverta `versao.txt` se não for publicar agora (`git checkout versao.txt`).

- [ ] **Step 6: Interruptor nos Ajustes**

Na aba Ajustes do `jogo.html` (onde já estão tema e cores de mandante), uma linha "Visual novo (em teste)" com dois botões, Ligado / Desligado, chamando `window.moVisual("novo")` / `window.moVisual("")`; o ligado marcado conforme `document.documentElement.dataset.visual`. Com a chave ligada, o seletor de tema oferece Claro / Escuro / Automático gravando `""` / `"escuro"` / `"auto"`.

- [ ] **Step 7: Conferência e commit**

Run: `node ferramentas/testes.mjs` → todos passam. Abra `http://localhost:8797/jogo.html` (`python -m http.server 8797`), ligue e desligue nos Ajustes: o `<html>` ganha/perde `data-visual`, nada mais muda na tela (o `trem.css` está vazio).

```bash
git add atualiza.js ferramentas/publicar.py jogo.html trem.css ferramentas/teste_visual_chave.mjs
git commit -m "Visual novo: chave mo_visual (data-visual), trem.css e tema claro como padrão com ela ligada"
```

---

### Task 2: Tokens e peças em CSS (`trem.css`)

**Files:**
- Modify: `trem.css`

**Interfaces:**
- Produces (variáveis, sob `:root[data-visual=novo]`, claro; e `:root[data-visual=novo][data-tema=escuro]`): `--t-fundo`, `--t-placa`, `--t-fio`, `--t-tinta`, `--t-tinta2`, `--t-tinta3`, `--t-noite`, `--t-noite2`, `--t-noite-fio`, `--t-noite-tx`, `--t-noite-mut`, `--t-marca` (`#d7261e` nos dois temas), `--t-erro`, `--t-ok`, `--t-atencao`, `--t-papel`, `--t-papel-tinta`, `--t-letra` (`"Archivo", "Arial Narrow", sans-serif`), `--t-maquina` (`"Martian Mono", ui-monospace, monospace`). Valores de partida do claro: os de `prototipos/tela_abas.html` (`--branco #fff`, `--placa #f4f4f1`, `--fio #e3e3de`, `--tinta #111418`, `--tinta2 #5d636b`, `--tinta3 #9aa0a6`, `--escuro #121a24`, `--escuro2 #1b2633`, `--escuro-fio #2c3846`, `--escuro-tx #eef2f6`, `--escuro-mut #8e9aa8`, `--ok #16834a`, `--atencao #b7791f`); `--t-erro` começa em `#b4401a` e é decidido lado a lado com a marca (Task 3, página de referência).
- Produces (classes): `.t-rotulo`, `.t-faixa` (+ `.t-faixa-titulo`, `.t-faixa-frase`, `.t-faixa-lado`), `.t-numero` (+ `.t-numero-valor`, `.t-numero-legenda`), `.t-leituras` (grade), `.t-leitura` (+ `[data-tipo=funcionou|falhou|atencao|desfalque|resultado|bloqueada]`), `.t-botao` (+ `.t-botao-principal`, `.t-botao-link`), `.t-segmentos`, `.t-documento`, `.t-linha` (+ `.t-estacao`, `.t-estacao.ativa`), `.t-topo`, `.t-secao`, `.t-tabela`, `.t-barra`, `.t-sobe` (entrada em cascata com `--i`).

- [ ] **Step 1: Escreva o `trem.css`**

Base sob a chave: `body` com `--t-fundo`, cor `--t-tinta`, `--t-letra` peso 300; `h1–h3` com `text-wrap: balance`; `:focus-visible` com contorno `--t-marca`. Peças conforme as imagens de referência 01–09 e os modelos `navegacao-celular.html`:
- `.t-rotulo`: caixa-alta, 11–11.5 px, peso 700, `letter-spacing .18em`, `::before` 18×4 px `--t-marca`.
- `.t-faixa`: fundo `--t-noite` com `radial-gradient` avermelhado no canto superior direito (como os recortes 07 e 08); grade 1.2fr/1fr no PC, uma coluna abaixo de 720 px; título `font-stretch 62%`, peso 900, `clamp(44px, 9vw, 96px)`, caixa-alta. **No escuro** a faixa tem de continuar sendo o foco: fundo um degrau **mais claro** que `--t-fundo` do escuro e o brilho da marca mais forte.
- `.t-leitura`: célula branca (no escuro, `--t-noite2`) numa grade de 1 px de `--t-fio`; marcador quadrado 8 px com a cor do tipo (funcionou `--t-ok`, falhou `--t-marca`, atenção `--t-atencao`, desfalque `--t-erro`, bloqueada `--t-tinta3` com opacidade); título `font-stretch 75%` peso 800 18–20 px.
- `.t-botao-principal`: fundo `var(--ac)`, letra `var(--ac-tx)`; `.t-botao`: fundo `--t-tinta`, letra branca (no escuro, invertido); `.t-botao-link`: sublinhado `--t-marca` 2 px.
- `.t-documento`: fundo `--t-papel` (`#f3ead2`), campos em `--t-maquina`, linhas tracejadas, borda serrilhada no topo (recorte 03).
- `.t-linha`: trilho de 3 px `--t-tinta`; `.t-estacao` bolinha 15 px com borda 3 px, nome embaixo em caixa-alta `font-stretch 72%` peso 700 10.5 px; `.ativa` com bolinha `--t-marca` e `transform: scale(1.3)` e nome em `--t-tinta`. **Abaixo de 720 px** a `.t-linha` é `position: fixed; bottom: 0` com `padding-bottom: env(safe-area-inset-bottom)` e o `body` ganha espaço embaixo; **acima de 720 px** fica no fluxo, sob o `.t-topo`. Com `mo_tela=pc` a viewport é 1100 px, então a regra de PC vale sozinha.
- `.t-sobe`: `animation` de 0.7 s, `animation-delay: calc(var(--i, 0) * 110ms)`; tudo sob `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 2: Conferência nas páginas que ainda não têm visual novo**

Com a chave ligada, abra `aovivo.html`, `guia.html`, `sede.html` a 375 px e a 1100 px: continuam legíveis (cores podem mudar pelo `body`; nada pode sumir ou ficar sem contraste). Se alguma ficar ilegível, restrinja a regra de base que causou isso. Anote no commit o que foi conferido.

- [ ] **Step 3: Commit**

```bash
git add trem.css
git commit -m "Visual novo: tokens claro/escuro e peças em trem.css"
```

---

### Task 3: Peças em JS (`src/ui-trem.js`) e página de referência

**Files:**
- Create: `src/ui-trem.js`
- Create: `design.html` (página de referência das peças; não é tela do jogador)
- Test: `ferramentas/teste_ui_trem.mjs`

**Interfaces:**
- Produces (todas devolvem `string` de HTML; todo parâmetro de texto é escapado, exceto os marcados `html`):
  - `esc(s: any) -> string`
  - `rotulo(texto: string) -> string` → `<div class="t-rotulo">…</div>`
  - `faixa({ rotulo: string, titulo: string, apagado?: string, destaque?: string, frase?: string, lado?: html }) -> string` (título em duas partes como "4º lugar ·" + `apagado` "8 rodadas"; `destaque` é o trecho em negrito antes da `frase`)
  - `numero({ rotulo: string, valor: string|number, sufixo?: string, legenda?: string }) -> string`
  - `botao({ texto: string, abaIr?: string, href?: string, tipo?: "principal"|"normal"|"link" }) -> string` (com `abaIr` vira `<button data-aba-ir="…">`, com `href` vira `<a>`)
  - `leitura({ tipo: "funcionou"|"falhou"|"atencao"|"desfalque"|"resultado"|"bloqueada", titulo: string, frase: string, acao?: { texto, abaIr?, href?, tipo? } }) -> string` (rótulo do tipo: Funcionou, Falhou, Atenção, Desfalque, O jogo, Analista)
  - `leituras(lista: Leitura[]) -> string` (grade; lista vazia → `""`)
  - `linhaDeEstacoes(estacoes: { aba: string, nome: string, curto?: string }[], atual: string) -> string` → `<nav class="t-linha" id="abas">` com `<button class="t-estacao" data-aba="…">`
  - `ESTACOES` = `[{aba:"inicio",nome:"Central"},{aba:"elenco",nome:"Elenco"},{aba:"tatica",nome:"Tática"},{aba:"base",nome:"Base"},{aba:"mercado",nome:"Mercado",curto:"Merc."},{aba:"clube",nome:"Clube"},{aba:"classificacao",nome:"Liga"}]`
  - `graficoDePosicoes(posicoes: number[], total: number, linha?: number) -> string` (SVG inline: posição por rodada, 1º no alto, linha tracejada `--t-ok` na fronteira da zona se `linha`; ponto final marcado)

- [ ] **Step 1: Escreva o teste**

```js
import assert from "node:assert/strict";
import { esc, rotulo, faixa, botao, leitura, leituras, linhaDeEstacoes, ESTACOES, graficoDePosicoes } from "../src/ui-trem.js";
assert.equal(esc(`<a & "b">`), "&lt;a &amp; &quot;b&quot;&gt;");
assert.match(rotulo("Bastidores"), /class="t-rotulo"[^>]*>Bastidores</);
assert.ok(!faixa({ rotulo: "x", titulo: "<script>" }).includes("<script>"));
assert.match(botao({ texto: "Ajustar a tática", abaIr: "tatica", tipo: "principal" }), /<button[^>]*class="t-botao t-botao-principal"[^>]*data-aba-ir="tatica"/);
assert.match(leitura({ tipo: "falhou", titulo: "As costas do Pedrinho", frase: "46%…" }), /data-tipo="falhou"/);
assert.equal(leituras([]), "");
const nav = linhaDeEstacoes(ESTACOES, "tatica");
assert.equal((nav.match(/class="t-estacao/g) || []).length, 7);
assert.match(nav, /class="t-estacao ativa"[^>]*data-aba="tatica"/);
assert.match(nav, /id="abas"/);
assert.match(graficoDePosicoes([9, 7, 4], 12, 4), /<svg/);
assert.equal(graficoDePosicoes([], 12), "");
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node ferramentas/teste_ui_trem.mjs` → FAIL (módulo não existe).

- [ ] **Step 3: Implemente `src/ui-trem.js`** com as assinaturas acima; uma função por `export const|function` (padrão do projeto).

- [ ] **Step 4: Rode e veja passar**

Run: `node ferramentas/teste_ui_trem.mjs` → código 0.

- [ ] **Step 5: `design.html`**

Página com `atualiza.js` + `estilo.css`, que força `data-visual="novo"` nela mesma (só nesta página) e mostra, com dados fictícios do Trem Soccer (os dos recortes: Ferroviário, Campinense, Kauã Itaberaba…): cada peça da Task 2/3, as cores com nome, e um botão para alternar claro/escuro. Serve para decidir `--t-erro` ao lado de `--t-marca` e o tratamento da faixa no escuro — ajuste os valores no `trem.css` aqui.

- [ ] **Step 6: Conferência em imagem**

Fotografe `design.html` a 375 px e a 1280 px, claro e escuro (Chrome headless ou o navegador). Procure: texto vazando da caixa, peça escondida, contraste baixo, marca e erro confundíveis. Corrija e anote no commit.

- [ ] **Step 7: Commit**

```bash
git add src/ui-trem.js design.html ferramentas/teste_ui_trem.mjs trem.css
git commit -m "Visual novo: peças em src/ui-trem.js e página de referência design.html"
```

---

### Task 4: Leituras (`src/leituras.js`)

**Files:**
- Create: `src/leituras.js`
- Test: `ferramentas/teste_leituras.mjs`

**Interfaces:**
- Consumes: `classificacao(clubes, partidas, resultados)` de `src/rodada.js`; o `relatorio` gravado em `resultados.relatorio` (saída de `montarRelatorio`: `estat[2]` com `zonas` `{ AE:[ganhos, perdidos], AC, AD, DE, DC, DD, ME, MC, MD }`, `jogadores[]` com `{ nome, pos, time, saiu, energia, minutos }`, `analise[2]: string[]`); jogadores do elenco no formato de `doElenco` (`{ nome, pos, fora, motivo: "lesão"|"suspensão"|…, juvenil }`).
- Produces:
  - `Leitura` = `{ tipo, titulo: string, frase: string, acao?: { texto: string, abaIr: string, tipo?: "principal"|"normal"|"link" } }` (mesmo formato que `leitura()` da Task 3 recebe)
  - `NOME_DA_ZONA` (os nomes de `src/relatorio.js`: "ataque pela esquerda", "defesa direita"…)
  - `leiturasDoVestiario({ relatorio, lado: 0|1, nivel: 1|2|3, elenco }) -> Leitura[]` (no máximo 4)
  - `posicoesPorRodada(clubes, partidas, resultados, clubeId) -> number[]` (posição do clube ao fim de cada rodada de liga com resultado)
  - `leituraDaTabela({ tab, clubeId, faixas: string[], rodadasRestantes: number }) -> { titulo, apagado, destaque, frase }` (`faixas[i]` = classes de `faixaDaTabela` no `jogo.html`: `camp`, `lib`, `sul`, `cai`, `sobe`, `playoff`, combinadas por espaço)
  - `leituraDoProximoJogo({ tab, clubeId, rivalId, formaDoRival: ("V"|"E"|"D")[] }) -> { titulo, frase }`

**Regras (o que o teste fixa):**
- Vestiário, prioridade nesta ordem, cortando em 4:
  1. `falhou` (nível ≥ 2): zona de ataque do adversário com maior taxa de duelos ganhos (mínimo 6 duelos), se > 50%, espelhada para a nossa defesa (AE→DD, AC→DC, AD→DE). Título "Pela nossa {zona}"; frase "O adversário venceu {x}% dos duelos ali."; ação "Ajustar a tática" → `tatica`, principal.
  2. `desfalque` (todo nível): jogadores do elenco, não juvenis, com `fora > 0`. Título "{Nome} está suspenso" / "lesionado" (dois ou mais: "{n} desfalques"); frase com os nomes e quantos jogos; ação "Escolher o substituto" → `tatica`.
  3. `funcionou` (nível ≥ 2): nossa zona de ataque com maior taxa (mínimo 6). Título "O {zona} funcionou"; frase "{x}% dos duelos vencidos ali."; ação "Manter a tática" → `tatica`, link.
  4. `atencao` (todo nível): nossos jogadores de linha que terminaram em campo (`saiu === null`, `pos !== "GK"`) com `energia < 60`. Título "Terminaram cansados"; frase com até três nomes.
  5. `resultado` (todo nível): `relatorio.analise[lado][0]`, título "O jogo".
  6. `bloqueada` (só nível 1, sempre a última): título "Por onde o jogo foi decidido"; frase "Contrate um analista para ver as zonas do jogo."; ação "Ver a comissão" → `clube`, link.
- Relatório sem `estat`/`zonas`/`jogadores`/`analise`: pula a regra que precisa do dado, nunca lança erro. `relatorio` nulo → `[]`.
- Tabela: título "{p}º lugar ·", apagado "{r} rodadas" ("1 rodada"; 0 → apagado "fim da fase"). Frase: se o clube está numa zona boa (`camp`, `lib`, `sul`, `sobe`, `playoff`), "{d} pontos à frente do {k}º" contra o primeiro clube fora da zona dele; se está em `cai`, destaque "Na zona de rebaixamento." frase "{d} pontos para sair."; senão, a zona boa mais próxima acima: destaque "A {d} pontos da {nome da zona}." (`sobe` "zona de acesso", `playoff` "zona do playoff", `lib` "Libertadores", `sul` "Sul-Americana", `camp` "liderança"). Sem jogos (`tab[i].j === 0` para todos): só título, sem frase.
- Próximo jogo: se a diferença de pontos ≤ 3, título "Confronto direto", frase "O {rival} está a {d} pontos de você." (d = 0 → "empatado com você em pontos."); senão título "{rival}, {k}º colocado". Se `formaDoRival` termina com 3 ou mais "V", acrescenta "Chega com {n} vitórias seguidas." Sem `rivalId` → `null`.

- [ ] **Step 1: Escreva o teste** com um relatório mínimo montado à mão (em cada zona 8 duelos; o adversário ganha 6 de 8 no `AE` dele, que vira a nossa `DD`; nós ganhamos 6 de 8 no `AC`; dois jogadores nossos de linha terminam em campo com energia 50), um elenco com um suspenso, e uma tabela de 8 clubes (ids 1–8, já ordenada, o clube 5 em 5º com 2 pontos a menos que o 4º) com `faixas = ["sobe", "sobe", "playoff", "playoff", "", "", "cai", "cai"]`, e o clube 4 com forma `["E","V","V","V"]`. Para `posicoesPorRodada`, 4 clubes e 3 rodadas de liga com resultado. Fixe:

```js
assert.deepEqual(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco }).map(l => l.tipo), ["falhou", "desfalque", "funcionou", "atencao"]);
assert.deepEqual(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 1, elenco }).map(l => l.tipo), ["desfalque", "atencao", "resultado", "bloqueada"]);
assert.equal(leiturasDoVestiario({ relatorio: null, lado: 0, nivel: 3, elenco }).length, 0);
assert.doesNotThrow(() => leiturasDoVestiario({ relatorio: { analise: [["ok"], []] }, lado: 0, nivel: 3, elenco: [] }));
assert.equal(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco }).find(l => l.tipo === "falhou").titulo, "Pela nossa defesa direita");
// mesmo dado → mesma saída
assert.deepEqual(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco }), leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco }));
assert.deepEqual(leituraDaTabela({ tab, clubeId: 5, faixas, rodadasRestantes: 8 }), { titulo: "5º lugar ·", apagado: "8 rodadas", destaque: "A 2 pontos da zona do playoff.", frase: "" });
assert.equal(leituraDaTabela({ tab: tabZerada, clubeId: 5, faixas, rodadasRestantes: 14 }).frase, "");
assert.equal(leituraDoProximoJogo({ tab, clubeId: 5, rivalId: 4, formaDoRival: ["E", "V", "V", "V"] }).titulo, "Confronto direto");
assert.match(leituraDoProximoJogo({ tab, clubeId: 5, rivalId: 4, formaDoRival: ["E", "V", "V", "V"] }).frase, /3 vitórias seguidas/);
const pos = posicoesPorRodada(clubes4, partidas4, resultados4, 1);
assert.equal(pos.length, 3);
assert.equal(pos[2], classificacao(clubes4, partidas4, resultados4).findIndex(t => t.clube.id === 1) + 1);
assert.equal(pos[0], 1); // o caso: o clube 1 vence a 1ª rodada e é o único vencedor por 2 gols
assert.deepEqual(posicoesPorRodada(clubes4, [], [], 1), []);
```

- [ ] **Step 2: Rode e veja falhar:** `node ferramentas/teste_leituras.mjs` → FAIL.
- [ ] **Step 3: Implemente `src/leituras.js`** conforme as regras; `import { classificacao } from "./rodada.js";` numa linha.
- [ ] **Step 4: Rode e veja passar:** `node ferramentas/teste_leituras.mjs` → código 0; `node ferramentas/testes.mjs` → todos passam.
- [ ] **Step 5: Commit**

```bash
git add src/leituras.js ferramentas/teste_leituras.mjs
git commit -m "Leituras: Vestiário pelo nível do analista, faixa da tabela e próximo jogo (src/leituras.js)"
```

---

### Task 5: Navegação e topo no `jogo.html`

**Files:**
- Modify: `jogo.html` — `telaClube` (montagem do cabeçalho e das abas, ~linhas 1909–1917), `abrir` (~2537–2538), CSS da página só se precisar de algo que não cabe no `trem.css`

**Interfaces:**
- Consumes: `linhaDeEstacoes`, `ESTACOES`, `esc` de `src/ui-trem.js`; `document.documentElement.dataset.visual`.
- Produces: `const visualNovo = document.documentElement.dataset.visual === "novo";` no topo do script do `jogo.html`, usado pelas Tasks 6+.

- [ ] **Step 1: Com `visualNovo`**, o cabeçalho vira `<header class="t-topo">`: escudo (`svgEscudo`, 40 px), nome do clube (caixa-alta, estreito, pesado) como `<button data-aba="config">` (é por ali que se chega aos Ajustes), a linha "Rodada N · dia, hora" do próximo jogo (preenchida onde hoje se preenche `kpiProx`), o selo do patrocinador master pequeno só no PC, e um `<div class="topo-jogo">` para a barra da conta (`barraNoCabecalho` continua funcionando). Sem a chave, o cabeçalho de hoje, intocado.
- [ ] **Step 2: Com `visualNovo`**, as abas viram `linhaDeEstacoes(ESTACOES, abaInicial)` (mantém `id="abas"`, então `$("abas").onclick` segue funcionando). Ajustes não é estação.
- [ ] **Step 3:** em `abrir`, troque `document.querySelectorAll(".aba")` por `document.querySelectorAll("#abas [data-aba]")` (vale para os dois visuais).
- [ ] **Step 4: Conferência:** sem a chave, o site idêntico ao de antes (compare as abas e o cabeçalho a 375 e a 1100 px). Com a chave: as 7 estações aparecem, a atual muda ao trocar de aba, endereço `#tatica` abre a Tática com a estação certa, Ajustes abre pelo nome do clube, a 375 px a linha fica embaixo e não cobre conteúdo, com `mo_tela=pc` ela fica em cima. `node ferramentas/testes.mjs` passa.
- [ ] **Step 5: Commit**

```bash
git add jogo.html trem.css
git commit -m "Visual novo: topo enxuto e linha de estações no jogo.html (atrás da chave)"
```

---

### Task 6: A Central nova

**Files:**
- Modify: `jogo.html` — seção `data-secao="inicio"` em `telaClube` (~1918–1945) e o trecho `if (g === clube.grupo)` de `grupo(g)` (~2787–2820)
- Modify: `src/banco.js` só se faltar leitura do relatório do último jogo (já existe `relatorioDaPartida(id)`)

**Interfaces:**
- Consumes: `faixa`, `rotulo`, `leituras`, `botao`, `numero`, `graficoDePosicoes` (Task 3); `leiturasDoVestiario`, `leituraDaTabela`, `leituraDoProximoJogo`, `posicoesPorRodada` (Task 4); `relatorioDaPartida` (`src/banco.js`); `nivelDoAnalista` (`src/saude.js`, já importado); `faixaDaTabela`, `classificacao`, `formaDe`, `muralDoClube`, `muralDaLiga`, `CONFIG_DIRETORIA`, `minhaMeta` (já no escopo de `telaClube`).

- [ ] **Step 1: Esqueleto com a chave.** A seção `inicio` passa a ter, nesta ordem (esqueleto fixo da spec): `#cnFoco` (faixa), `#cnVestiario` (rótulo "Vestiário" + grade de leituras), `#cnProximo` (próximo jogo), `#cnBastidores` (rótulo "Bastidores": as três primeiras entradas do mural do clube e da liga, com título e uma linha, no estilo do recorte 05), `#cnDiretoria` (frase do presidente se houver + barra de confiança 0–100 com a marca em 50, recorte 05), e no fim, recolhido, "Amistoso" (`<details>`, com os mesmos `id`s de hoje — `amAdv`, `amMando`, `amJogar`, `amInfo`, `amRel` — para o código do amistoso seguir funcionando; sem os textos explicativos de hoje). Sem `kpis`, sem "Notícias da liga"/"Mural do clube" como cards separados, sem `#chegada` em destaque (o conteúdo de chegada que for sobre o clube entra em Bastidores). Sem a chave, a seção de hoje.
- [ ] **Step 2: Preencher no `grupo(g)`.** Dentro de `if (g === clube.grupo)`, com `visualNovo`, não escreva nos `id`s velhos (`proximos`, `proximo`, `miniTabela`, `kpi*`, `termometro` — guarde cada escrita com `if ($(...))` ou ramifique o bloco). Preencha:
  - `#cnFoco` ← `faixa({ rotulo: "{nome do grupo} · rodada {j} de {total}", ...leituraDaTabela({ tab, clubeId: clube.id, faixas: tab.map((t, i) => faixaDaTabela(serie, i, tab.length, tab)), rodadasRestantes }), lado: rotulo("Posição rodada a rodada") + graficoDePosicoes(posicoesPorRodada(doGrupo, partidas, resultados, clube.id), tab.length, linhaDaZona) })`.
  - `#cnVestiario` ← se há `ultimo` com resultado: `relatorioDaPartida(ultimo.id)` → `leituras(leiturasDoVestiario({ relatorio: r.relatorio, lado: ultimo.casa === clube.id ? 0 : 1, nivel: nivelDoAnalista(analista && analista.skill), elenco }))`; título da seção "O que levar para o próximo jogo" e o placar do último jogo em uma linha; sem `ultimo`, esconda a seção inteira.
  - `#cnProximo` ← escudos dos dois clubes, nomes grandes, forma em bolinhas (a `formaDe` existente), dia/hora/estádio em uma linha, `leituraDoProximoJogo(...)`, botões `botao({ texto: "Ajustar a tática", abaIr: "tatica", tipo: "principal" })` e "Ver o rival" (link para o clube do rival, como `lk(rival.id)` faz). Sem próximo jogo: "Não há mais jogos nesta temporada." e nada mais.
- [ ] **Step 3: Conferência em imagem.** Com a chave, Central a 375 px e a 1280 px, claro e escuro, em três situações: (a) clube no meio da tabela com último jogo e analista, (b) sem analista (Vestiário com o card bloqueado), (c) início de temporada sem jogos (sem Vestiário, faixa sem frase). Procure: um foco só, nada de frase explicando a tela, texto vazando, números da faixa batendo com a tabela da aba Liga. Sem a chave: a Central de hoje, idêntica. `node ferramentas/testes.mjs` passa.
- [ ] **Step 4: Commit**

```bash
git add jogo.html src/banco.js
git commit -m "Visual novo: Central com faixa da tabela, Vestiário pelo analista, próximo jogo e bastidores (atrás da chave)"
```

---

## Depois deste plano (cada um com o seu plano, nesta ordem)

1. **Elenco e Tática** — lista de jogadores (nome em negrito, linha apagada, nota grande, preço em destaque) e instruções em `.t-segmentos` com aviso só se houver problema (recorte 06).
2. **Mercado** — boleta como `.t-documento` (recorte 03), fita de transferências com uma cor por tipo (recorte 04).
3. **Clube** — finanças em barras e estádio por níveis (recorte 09); "só o próximo passo ativo" na obra.
4. **Liga** — tabelas, chaves, gráfico de posição; aplicar as mudanças do reinício nas duas versões enquanto a chave não virar.
5. **Base** — faixa da promessa da temporada (recorte 07).
6. **Ajustes** — no visual novo, inteiro.
7. **Ao vivo** (`aovivo.html`) — repensado na gramática, mantendo placa do quarto árbitro, barra de pênaltis, wipe de gol, momento/xG.
8. **Guia do dirigente** (`guia.html`) na gramática + a máquina "O que vence o quê" com a skill `anatomy`, números do motor de verdade.
9. **Sede, temporada, jogador, partida da base.**
10. **Home** (`index.html` a partir de `prototipos/home_trem.html`, sem Tailwind, login de `src/ui-login.js`).
11. **Virada** — junto com o reinício: a chave vira padrão (claro para todos), sai o visual velho (CSS e ramos `visualNovo`), sai o interruptor dos Ajustes. A versão de antes está na tag `visual-antigo`.
