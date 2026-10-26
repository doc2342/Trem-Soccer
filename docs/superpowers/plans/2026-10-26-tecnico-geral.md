# Técnico do ano geral — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um prêmio "Técnico do ano" geral, só entre dirigentes, que soma pontos de liga, playoff da B e copas, gravado no fechamento da temporada junto com o técnico de cada série.

**Architecture:** função pura `tecnicoGeral` em `src/rodada.js` (pesos numa constante). O fechamento manual (`admin.html`) e o automático (`fecharTemporadas`, no template de `ferramentas/empacotar_funcao.py`) acrescentam o resultado dela à lista que já mandam para `premiar_tecnicos` / `fechar_temporada`. Gravado em `premios_individuais` com `comp = "TODOS"`, `premio = "tecnico"`, `numero` = pontos. A chave primária `(liga_id, temporada, comp, premio)` aceita isso sem SQL novo.

**Tech Stack:** JS (ES modules, sem build), teste com `node:assert`, Supabase Edge Function gerada pelo empacotador.

**Spec:** `docs/superpowers/specs/2026-10-26-tecnico-geral-design.md`

**Modelo para executar:** Sonnet (tarefas pequenas, bem especificadas); Native, sem subagentes.

## Global Constraints
- Tudo em português do Brasil (código, comentários, UI, commits).
- Determinismo: nada de `Math.random()`; a função é pura.
- Empacotador: `import { … } from "./x.js";` numa linha só; um `export const|function` por declaração.
- Pesos exatamente os da spec (tabela abaixo, na Tarefa 1).
- Nunca editar à mão `supabase/functions/*/index.ts`: rodar `python ferramentas/empacotar_funcao.py`.

## Review Focus
- Copa ainda sem final decidida (`vencedor` nulo) na hora do fechamento → conta só a fase alcançada; ninguém vira campeão.
- Clube com dirigente que não jogou copa nem continental → só os pontos da liga; não pode quebrar.
- Grupo da Série B sem playoff (`liga.copa.sem_playoffs`, ou grupo com menos de 6 clubes) → campeão da B é o 1º da liga (`posicao === 1`), como `campeaoDaSerie` antes da T14.
- Nenhum clube com dono, ou todos com 0 ponto → `null` (nada gravado).
- Partidas de outros países (grupos de `PAISES`) e o guardado → ignorados.

---

### Tarefa 1: `tecnicoGeral` e o teste

**Files:**
- Modify: `src/rodada.js` (logo depois de `tecnicosDoAno`, ~linha 339)
- Create: `ferramentas/teste_tecnico_geral.mjs`

**Interfaces:**
- Consumes: linhas de `classificacaoFinal` (`{ clube_id, divisao, grupo, posicao }`), `tecnicosDoAno(linhas, elencos)` (para o desempate), `vencedorDoGrupo(partidas, resultados, g)`.
- Produces:
  - `export const PESOS_DO_TECNICO_GERAL = { A: [10, 8, 7, 6, 5, 4, 3, 3, 2, 1, 0, 0], B: [4, 3, 2, 1, 1, 1], playoff: { campeao: 6, vice: 4, semi: 3 }, LIB: [11, 7, 4, 2], COPA: [6, 4, 2, 1], SUL: [5, 3, 2, 1], SUPER: 1, REC: 1 }` — mata-mata na ordem campeão, vice, semifinal, quartas.
  - `export function pontosDoTecnicoGeral({ linhas, partidas, resultados, donos }) -> { [clube_id]: pontos }` (só clubes em `donos`, um `Set` de ids).
  - `export function tecnicoGeral({ linhas, partidas, resultados, elencos, donos }) -> { grupo: "TODOS", clube_id, numero } | null` (`numero` = pontos).

Regras (da spec):
- Liga: divisão 1 → `A[posicao - 1] ?? 0`; divisão 2 e grupo fora de `PAISES` → máximo entre `B[posicao - 1] ?? 0` e o playoff do grupo. Playoff: vencedor da fase `"final"` (`vencedorDoGrupo`) = `campeao`; o outro finalista = `vice`; quem jogou `"semi"` e não a final = `semi`. Grupo sem jogo `"final"`: o 1º da liga ganha `campeao`.
- Copa (`fase "copa"`): `copa_fase` 6 com `vencedor` → campeão; o outro da final → vice; quem chegou a 5 → semi; a 4 → quartas. `copa_fase 0` com `vencedor` → `SUPER` para o vencedor.
- Continentais (`fase "lib"`): por `grupo` LIB / SUL com a mesma régua (`copa_fase` 6, 5, 4); REC: `vencedor` do jogo `copa_fase 6` ganha `REC`.
- Desempate: maior `numero` de superação na série (calculado como em `tecnicosDoAno`, por grupo), depois menor `posicao`.

- [ ] **Passo 1: escrever o teste que falha** — `ferramentas/teste_tecnico_geral.mjs`, montando uma liga mínima à mão (Série A de 12 clubes, um grupo B de 8 com semi e final, jogos de copa e de LIB com `copa_fase`/`vencedor`, resultados) e assertando:
  ```js
  // casos da spec, com pontosDoTecnicoGeral
  assert.ok(pts[campeaoA_e_Copa] === 16);
  assert.ok(pts[campeaoLib_meioDeTabela] === 15);           // Lib 11 + 6º da A (4)
  assert.ok(pts[campeaoA_e_Copa] > pts[campeaoLib_meioDeTabela]);
  assert.ok(pts[campeaoLib_e_A] === 21);
  assert.ok(pts[campeaoB_e_Copa] === 12);                     // campeão do playoff 6 + Copa 6
  assert.equal(pts[bot], undefined);                          // bot fora
  assert.equal(tecnicoGeral({ ..., donos: new Set() }), null);
  // final da copa sem vencedor: os dois finalistas ficam com "semi" ou mais, ninguém com 6 da copa
  // grupo B sem fase "final": o 1º da liga recebe 6
  // empate em pontos: ganha quem tem maior superação na série
  ```
  (Cada cenário pode ser uma liga separada; o teste não precisa dos quatro casos na mesma temporada.)
- [ ] **Passo 2:** `node ferramentas/teste_tecnico_geral.mjs` → falha com "tecnicoGeral is not exported" (ou equivalente).
- [ ] **Passo 3:** implementar `PESOS_DO_TECNICO_GERAL`, `pontosDoTecnicoGeral` e `tecnicoGeral` em `src/rodada.js`, com o comentário de uma linha no estilo de `tecnicosDoAno`.
- [ ] **Passo 4:** `node ferramentas/teste_tecnico_geral.mjs` passa; `node ferramentas/testes.mjs` → tudo ok.
- [ ] **Passo 5:** commit `src/rodada.js` + o teste (o pre-commit reempacota; se ele pedir, `git add supabase/functions` e commitar de novo).

### Tarefa 2: ligar no fechamento e mostrar

**Files:**
- Modify: `admin.html:25` (import) e `admin.html:679` (chamada)
- Modify: `ferramentas/empacotar_funcao.py:55` (nomes desestruturados de `__rodada`) e `:167-182` (`fecharTemporadas`)
- Modify: `jogo.html:678` (`nomeDoPremio`), `:1239` (lista antiga), `:1334-1338` (`premiosNovos`: `serie` e `UNIDADE`/`extra`)
- Generated: `supabase/functions/rodada/index.ts` (empacotador)

**Interfaces:**
- Consumes: `tecnicoGeral({ linhas, partidas, resultados, elencos, donos })` da Tarefa 1.

- [ ] **Passo 1 — admin:** em `admin.html:679`, a lista passa a ser `[...tecnicosDoAno(plano.classificacao, elencos), ...[tecnicoGeral({ linhas: plano.classificacao, partidas, resultados, elencos, donos: new Set(lista.filter(c => c.dono).map(c => c.id)) })].filter(Boolean)]`. `partidas` é `select *` (tem `copa_fase`, `vencedor`); `resultados` já está no escopo.
- [ ] **Passo 2 — servidor:** em `fecharTemporadas`, ler também `fase in (copa, lib)` com `id, grupo, rodada, fase, copa_fase, casa, fora, vencedor` (paginado como o atual) só para o `tecnicoGeral`, sem misturar com as `partidas` que vão para `classificacaoFinal`; `p_tecnicos` recebe a mesma concatenação do passo 1, `donos` pelos `clubes` com `dono`. Acrescentar `tecnicoGeral` ao destructuring da linha 55.
- [ ] **Passo 3 — tela:** prêmio com `comp === "TODOS"` aparece como "Técnico do ano" com o rótulo "Geral" no lugar da série (nas três telas listadas) e a unidade "pts" em vez de "posições" (sem o "+").
- [ ] **Passo 4:** `python ferramentas/empacotar_funcao.py`; `node ferramentas/testes.mjs` → tudo ok; abrir `jogo.html` local (Estatísticas → prêmios) não dá para conferir sem temporada fechada — conferir pelo menos que a página carrega sem erro no console.
- [ ] **Passo 5:** `python ferramentas/publicar.py`; commit de `admin.html`, `jogo.html`, `ferramentas/empacotar_funcao.py`, `supabase/functions`, `versao.txt`; push no `main`. Avisar o dono: republicar a função `rodada` no Supabase.
