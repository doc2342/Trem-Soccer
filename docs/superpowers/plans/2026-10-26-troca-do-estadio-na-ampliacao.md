# Troca do estádio na ampliação · plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a arquitetura e/ou a cidade do estádio só junto com uma ampliação. Custa +50%, a primeira ampliação é grátis e o nível 8 tem uma troca de 15 mi em 18 rodadas. Fica a troca grátis para estádio novo.

**Architecture:** Um SQL novo (`supabase/154_troca_do_estadio_na_ampliacao.sql`) reescreve `iniciar_obra`, `reformar_estadio`, `salvar_estadio_visual` e o gatilho de conclusão. A escolha fica em `estadio_visual.modelo_alvo`/`cidade_alvo` e o gatilho do 116 a aplica quando a obra é concluída. As obras são concluídas pelo SQL da rodada (`update obras set concluida = true`), então não é preciso republicar a função `rodada`. A tela de estádio de `jogo.html` ganha "manter ou mudar" na ampliação.

**Tech Stack:** PL/pgSQL (Supabase), JS de navegador sem build, teste com `node:assert` e PGlite.

**Modelo:** Sonnet 5.5 em sessão única (Native). São só 2 tarefas, a regra está toda fechada no spec e o SQL segue funções que já existem. Revisão final com Opus.

**Spec:** `docs/superpowers/specs/2026-10-26-troca-do-estadio-na-ampliacao-design.md`

## Global Constraints
- Tudo em português do Brasil: código, comentários, mensagens de erro e commits.
- O SQL é idempotente (`create or replace`, `drop ... if exists`) e roda duas vezes no teste. O cabeçalho segue o padrão: o que faz, "Precisa do 123 e do 129", e "Rodar no reinício (roteiro da virada). Não exige republicar função."
- Valores em mil (como `custo_da_obra`): a taxa é `round(0.5 * custo_da_obra('estadio', nivel_alvo))`. A troca no nível 8 custa `15000` e leva `18` rodadas (`custo_da_obra('estadio', 8) / 2` e `prazo_da_obra(8) / 2`).
- Primeira ampliação = `nivel_alvo = 2`: escolha livre, sem taxa.
- Modelos válidos: a lista de `reformar_estadio` do `129` (`tradicional, caldeirao, arena, dunas, ferradura, bomboneira, laterais, inflavel, sansiro, wembley, maracana`). Cidades: `centro, bairro, rio, lago, litoral`.
- Escolher o modelo ou a cidade atual não conta como mudança. Para a cidade, o valor atual é `cidade_do_estadio(id)`, que inclui a sorteada pelo id.
- Fica: `liberar_troca_gratis` e `reforma_gratis_para` (127/128/129), grátis e na hora, em qualquer nível. Saem: `reforma_gratis`, `cidade_trocada`, a troca de cidade em `salvar_estadio_visual` e o gatilho `estadio_gratis_para_dono_novo` (120).
- Nada de `Math.random()`. O `publicar.py` roda antes do commit que vai ao ar.

## Review Focus
1. Uma obra de ampliação com modelo ou cidade é concluída: o modelo e a cidade novos aparecem, o `modelo_alvo`/`cidade_alvo` somem e o nível sobe junto. Teste `conclusao_aplica_modelo_e_cidade`.
2. A pessoa manda o modelo atual com uma cidade nova: cobra a taxa uma vez só e grava só `cidade_alvo`. Teste `so_cidade_cobra_uma_taxa`.
3. Caixa suficiente para a ampliação mas não para a taxa: dá erro com o custo total na mensagem e não cobra nada. Teste `caixa_sem_taxa_falha_inteiro`.
4. A troca no nível 8 fora do nível 8 é recusada, mas a troca grátis de estádio novo vale em qualquer nível. Testes `nivel8_so_no_maximo` e `gratis_de_estadio_novo_em_qualquer_nivel`.
5. O site novo contra um banco sem o 154, nas semanas antes do reinício: ampliar sem escolha continua funcionando. Isso é coberto pela tolerância em `iniciarObra` (Task 2) e conferido à mão.

---

### Task 1: SQL 154 e teste

**Files:**
- Create: `supabase/154_troca_do_estadio_na_ampliacao.sql`
- Create: `ferramentas/teste_troca_do_estadio_sql.mjs` (padrão de `ferramentas/teste_vaga_sql.mjs`: stubs mínimos de `clubes`, `financas`, `obras`, `lancamentos`, `ligas`, `meu_clube()` por variável de sessão, `custo_da_obra`/`prazo_da_obra` copiados do `55`, `cidade_do_estadio` do `119`, `gratis_para_lista` do `128`. O SQL roda duas vezes.)
- Modify: `docs/superpowers/plans/2026-10-25-roteiro-da-virada.md` (o passo "rodar o 154" no bloco de SQL do reinício)

**Interfaces:**
- Produces:
  - `public.iniciar_obra(p_estrutura text, p_modelo text default null, p_cidade text default null) returns void`. Primeiro faz `drop function if exists public.iniciar_obra(text)`. O modelo e a cidade só valem para `'estadio'`. Para outra estrutura com os dois preenchidos, dá o erro `'Modelo e cidade só valem para o estádio.'`.
  - `public.reformar_estadio(p_modelo text, p_cidade text default null) returns void`. Primeiro faz `drop function if exists public.reformar_estadio(text)`. Gasta antes a troca grátis de estádio novo (`reforma_gratis_para`, ignora a cidade, na hora, em qualquer nível). Fora isso, só aceita `estadio_nivel = 8` e erra com `'A troca de modelo ou cidade só sai junto com uma ampliação; no nível 8, é uma obra de 15 mi.'`. A obra é `estrutura = 'estadio_modelo'`, com 15000 e 18 rodadas, e grava `modelo_alvo`/`cidade_alvo`.
  - `public.salvar_estadio_visual(p jsonb)`: igual ao `126`, sem o ramo da cidade. Se `p ? 'cidade'` e ela for diferente da atual, erra com `'A cidade só muda numa ampliação do estádio.'`.
  - Gatilho `reforma_do_estadio_concluida` em `obras`, para `estrutura in ('estadio', 'estadio_modelo')`. A função `concluir_reforma_do_estadio()` aplica `modelo_alvo`→`modelo` e `cidade_alvo`→`cidade` (cada um só se existir) e remove as duas chaves.
  - Limpeza: `update clubes set estadio_visual = estadio_visual - 'reforma_gratis' - 'cidade_trocada' where estadio_visual ?| array['reforma_gratis','cidade_trocada']`, mais `drop trigger if exists estadio_gratis_para_dono_novo on clubes` e `drop function if exists estadio_gratis_para_dono_novo()`.

- [ ] **Step 1: Escrever o teste falhando.** Cada caso começa com um clube de caixa 100000 e nível conhecido, chama a RPC como o dono e confere o caixa, a obra e o `estadio_visual`:
  - `primeira_ampliacao_gratis`: nível 1, `iniciar_obra('estadio','arena','rio')` → caixa −1500, `obras.custo = 1500`, `modelo_alvo = 'arena'`, `cidade_alvo = 'rio'`.
  - `segunda_com_taxa`: nível 2, `iniciar_obra('estadio','dunas',null)` → custo 3000 + 1500 = 4500.
  - `sem_mudanca_preco_normal`: nível 2, `iniciar_obra('estadio', <modelo atual>, cidade_do_estadio(id))` → custo 3000, sem `_alvo`.
  - `so_cidade_cobra_uma_taxa`: nível 3, modelo atual e uma cidade nova → 5000 + 2500, só `cidade_alvo`.
  - `caixa_sem_taxa_falha_inteiro`: nível 3, caixa 6000, com mudança → erro com `7500`, caixa continua 6000 e nenhuma obra criada.
  - `nivel8_quinze_mi`: nível 8, `reformar_estadio('wembley','lago')` → caixa −15000, obra `estadio_modelo` com `rodadas_total = 18`.
  - `nivel8_so_no_maximo`: nível 5, `reformar_estadio('arena')` → erro "só sai junto com uma ampliação".
  - `gratis_de_estadio_novo_em_qualquer_nivel`: nível 3 com `reforma_gratis_para = ["maracana"]`, `reformar_estadio('maracana')` → `modelo = 'maracana'` na hora e caixa intacto.
  - `conclusao_aplica_modelo_e_cidade`: depois de `primeira_ampliacao_gratis`, `update obras set concluida = true` → `modelo = 'arena'`, `cidade = 'rio'`, sem `modelo_alvo`/`cidade_alvo`.
  - `cidade_fora_da_ampliacao`: `salvar_estadio_visual('{"cidade":"lago"}')` → erro "só muda numa ampliação". Com `{"nomeEstadio":"X"}` → salva.
  - `limpeza`: um clube com `reforma_gratis` e `cidade_trocada` antes do SQL fica sem as duas chaves depois.
  - `modelo_desconhecido`: `iniciar_obra('estadio','castelo',null)` → `'Modelo desconhecido.'`. Com cidade `'deserto'` → `'Cidade desconhecida.'`.
- [ ] **Step 2:** `node ferramentas/teste_troca_do_estadio_sql.mjs`. Esperado: falha, porque o arquivo 154 não existe.
- [ ] **Step 3:** Escrever o `154` com as interfaces acima. Partir do `iniciar_obra` do `55` (mesma validação e mesmo extrato, com a descrição `'Obra: estadio para o nível N'`, mais `' + troca de modelo/cidade'` quando houver taxa) e do `reformar_estadio` do `129`. Cada `drop function` deve vir antes do `create`, e os `revoke`/`grant` com a assinatura nova.
- [ ] **Step 4:** `node ferramentas/teste_troca_do_estadio_sql.mjs` e `node ferramentas/testes.mjs`. Esperado: tudo ok.
- [ ] **Step 5:** Pôr o 154 no roteiro da virada, no bloco de SQL do reinício, depois do 153. Commit: `Estádio: troca de modelo e cidade só na ampliação (+50%, 1ª grátis, nível 8 a 15 mi): SQL 154 e teste`.

### Task 2: Site (banco.js e tela do estádio)

**Files:**
- Modify: `src/banco.js:247` (`iniciarObra`) e `:250` (`reformarEstadio`)
- Modify: `jogo.html`, na tela do estádio (`CUSTO_DA_REFORMA`/`PRAZO_DA_REFORMA` por volta da linha 2346, `paginaDoEstadio` por volta da 2357, o texto da reforma por volta da 2364, o botão de ampliar por volta da 2375 e o da tela antiga por volta da 2414, os handlers por volta de 2462–2469 e 4740)

**Interfaces:**
- Consumes: as RPCs da Task 1.
- Produces:
  - `iniciarObra(estrutura, troca)`, em que `troca` é opcional e tem o formato `{ modelo, cidade }`. Sem `troca`, chama `iniciar_obra` só com `p_estrutura`, como hoje, e funciona com o banco antigo. Com `troca`, manda `p_modelo`/`p_cidade`.
  - `reformarEstadio(modelo, cidade)`: manda `p_cidade` só quando definido.

- [ ] **Step 1:** Ajustar `banco.js` conforme as interfaces. Sem `troca`, a chamada é a mesma de hoje, e essa é a tolerância ao banco sem o 154.
- [ ] **Step 2:** Na tela do estádio, a ficha da ampliação ganha dois seletores, Modelo e Cidade (das listas `MODELOS` e `CIDADES` de `src/estadio.js`), com o valor atual pré-marcado como "manter". Debaixo do botão, mostrar:
  - "Ampliar para o nível N · X · P rodadas" sem mudança;
  - "+Y pela troca (50%)" com mudança;
  - "troca grátis: primeira ampliação" quando N = 2.

  O botão passa `{ modelo, cidade }` só com o que mudou. A prévia (`plantaDaObra`) usa o modelo e a cidade escolhidos. Com obra `estadio` e `modelo_alvo`, a tag mostra "obra para o nível N, com o modelo X".
- [ ] **Step 3:** No nível 8, mostrar a troca de 15 mi e 18 rodadas (seletores iguais, botão "Trocar"). Fica o aviso de troca grátis para estádio novo (`reforma_gratis_para`). Remover: `CUSTO_DA_REFORMA`/`PRAZO_DA_REFORMA`, os textos de reforma de 25%, `reforma_gratis` geral e `cidade_trocada`, e a escolha de cidade do editor do visual.
- [ ] **Step 4:** Conferir no navegador (`python -m http.server 8797`, `jogo.html` logado):
  - nível 1 mostra "grátis";
  - nível 2 ou mais mostra o +50%;
  - nível 8 mostra 15 mi;
  - a prévia muda ao escolher.

  Contra o banco atual, sem o 154, ampliar sem mudar nada continua funcionando. Rodar `node ferramentas/testes.mjs`.
- [ ] **Step 5:** Commit numa branch `troca-do-estadio`, não na `main`. Qualquer push da `main` publica o site, e a tela nova mostraria regras que o banco ainda não tem. Mensagem: `Estádio: ampliar escolhendo modelo e cidade (+50%, 1ª grátis) e troca do nível 8 na tela`. No reinício, o roteiro da virada faz o merge, roda o `publicar.py` e dá o push, junto com o 154. Se a Task 1 já estiver na `main`, não faz mal: o SQL só vale quando rodado.
