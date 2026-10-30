# Aba Amistoso — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aba Amistoso com tática própria, desafio instantâneo com replay (~1 min) e relatório gravados, parceiros de treino, opção "Aceitar amistosos" e bloqueio do próximo adversário; papel escondido na tática da liga até a T1.

**Architecture:** o banco (SQL novo, RPCs `security definer`) confere as regras, lê a tática do adversário e sorteia a semente; o navegador simula com o motor de `src/` (regras da T1 ligadas) e grava o resultado na linha do amistoso; quem abre depois lê o que foi gravado, sem simular de novo. Lógica do jogo num módulo puro (`src/amistoso.js`), tela em `jogo.html` reaproveitando `ui-escalacao.js` e `ui-relatorio.js`.

**Tech Stack:** HTML + módulos ES nativos, Supabase (Postgres, RLS, pg_cron), testes `node:assert` + PGlite.

**Spec:** `docs/superpowers/specs/2026-10-30-aba-amistoso-design.md`

**Modelo:** Opus para as tarefas 1, 3 e 5 (regras no SQL, motor, tela grande); Sonnet dá conta das tarefas 2, 4, 6 e 7.

## Global Constraints

- Tudo em português do Brasil: código, comentários, identificadores, textos, commits.
- A função `rodada` e tudo que a partida oficial usa não mudam (antimeta). `src/rodada.js` só é lido.
- Nenhum `Math.random()` dentro de `src/amistoso.js`; a semente vem de fora.
- SQL idempotente (`if not exists`, `create or replace`, `drop policy if exists`), cabeçalho no padrão ("Precisa do …", "Depois: publicar o site").
- `banco.js` tolera o esquema antigo: sem as tabelas novas, a aba diz "Falta rodar o 165_amistosos.sql" em vez de quebrar.
- Prazo do relatório completo: **7 dias**, uma constante só no SQL. Placar e resumo ficam para sempre.
- Limite: **1 por dia** do desafiante contra o mesmo desafiado (dia no fuso `America/Sao_Paulo`); bloqueio só da **próxima** partida oficial.
- "Aceitar amistosos" **desmarcado por padrão**.
- Replay: ~**60 s** por jogo, com velocidade ajustável e "pular".

## Review Focus

1. **Desafiado sem tática de amistoso nem tática do campeonato** (time novo): o jogo tem que sair com a tática de bot dele, não dar erro. → teste na tarefa 3.
2. **Navegador fechado no meio** (linha criada, `gravar_amistoso` nunca chamado): aparece como "não terminou", conta para o limite e não quebra a lista nem a Central. → teste na tarefa 1.
3. **Tática de amistoso citando jogador que saiu do clube** (vendido depois de salvar): `taticaDoDirigente` devolve null → cai para a do campeonato → bot. → teste na tarefa 3.
4. **Clube que troca de dono**: a tática de amistoso e as parcerias do dono antigo somem. → teste na tarefa 1.
5. **Próximo jogo de copa no meio da liga**: o bloqueio olha a próxima partida não processada de qualquer fase, menos `base`. → teste na tarefa 1.

---

### Task 1: SQL dos amistosos

**Files:**
- Create: `supabase/165_amistosos.sql`
- Test: `ferramentas/teste_amistosos_sql.mjs` (padrão de `ferramentas/teste_papel_jogado_sql.mjs`: PGlite, stubs mínimos de `clubes`, `partidas`, `taticas`, `auth.uid()`, executa o arquivo duas vezes)

**Interfaces:**
- Produces (tabelas): `clubes.aceita_amistoso boolean not null default false`; `taticas_amistoso(clube_id pk → clubes on delete cascade, dados jsonb not null, atualizada_em timestamptz default now())` com RLS igual à de `taticas_base` (só o dono lê e grava); `parcerias_amistoso(clube_a bigint, clube_b bigint, pedida_por bigint, aceita_em timestamptz null, primary key (clube_a, clube_b), check (clube_a < clube_b))`, lida pelos dois clubes; `amistosos(id bigserial, desafiante bigint, desafiado bigint, mando text check in ('casa','fora'), semente integer, criado_em timestamptz default now(), placar smallint[] null, resumo jsonb null, partida jsonb null, relatorio jsonb null, visto_em timestamptz null)`, lida pelos donos dos dois clubes, sem insert/update direto.
- Produces (RPCs, todas `security definer`, `auth.uid()` tem que ser dono do clube que age):
  - `motivo_amistoso(p_desafiante bigint, p_desafiado bigint) returns text`: null = liberado; senão um de `'fechado'` (o desafiado tem dono, não aceita e não é parceiro), `'voce_fechado'` (o desafiante não aceita, o desafiado tem dono e não é parceiro), `'hoje'` (já existe amistoso desafiante→desafiado com `criado_em` no mesmo dia de Brasília e não é parceiro), `'proximo'` (os dois se enfrentam na próxima partida com `processada = false` e `fase <> 'base'` de qualquer um dos dois, e não são parceiros). Ordem de checagem: `fechado`, `voce_fechado`, `proximo`, `hoje`.
  - `adversarios_de_amistoso(p_clube bigint) returns table(clube_id bigint, motivo text, parceiro boolean)`: todos os clubes da liga de `p_clube`, menos ele.
  - `iniciar_amistoso(p_clube bigint, p_desafiado bigint, p_mando text) returns jsonb`: exige dono no desafiado (sem dono → exceção "Clube sem dirigente: jogue direto"); motivo não nulo → exceção com o texto do motivo; apaga `partida`/`relatorio` com mais de 7 dias; insere a linha com semente `floor(random() * 2147483647)`; devolve `{ id, semente, tatica }`, onde `tatica` = `taticas_amistoso.dados` do desafiado, senão `taticas.dados`, senão null.
  - `gravar_amistoso(p_id bigint, p_placar smallint[], p_resumo jsonb, p_partida jsonb, p_relatorio jsonb) returns void`: só o dono do desafiante, só se `placar is null`, só até 30 min depois de `criado_em`.
  - `pedir_parceria(p_clube, p_outro)`, `responder_parceria(p_clube, p_outro, p_aceita boolean)` (recusar apaga), `desfazer_parceria(p_clube, p_outro)`.
  - `aceitar_amistosos(p_clube bigint, p_aceita boolean)`.
  - `marcar_amistosos_vistos(p_clube bigint, p_ids bigint[])`: só o dono do desafiado.
- Trigger em `clubes` (troca de dono): apaga `taticas_amistoso` do clube, parcerias dele e volta `aceita_amistoso` a false.
- `cron.schedule('limpar-amistosos', '15 4 * * *', …)` apagando `partida`/`relatorio` com mais de 7 dias (o projeto já usa pg_cron em `06_agendamento.sql`; no teste PGlite, criar o schedule só `if exists (select 1 from pg_extension where extname = 'pg_cron')`).

- [ ] **Step 1: Escrever `teste_amistosos_sql.mjs`** com clubes 1 (dono u1), 2 (dono u2), 3 (dono u3), 4 (sem dono), e asserts:
  - todos fechados: `motivo_amistoso(1,2) = 'fechado'`; 2 aceita: `= 'voce_fechado'`; 1 e 2 aceitam: `null`.
  - depois de `iniciar_amistoso(1,2,'casa')`: `motivo_amistoso(1,2) = 'hoje'`, `motivo_amistoso(2,1) = null`; linha nunca gravada continua contando (Review Focus 2) e `adversarios_de_amistoso(1)` lista o 2 com `'hoje'`.
  - partida (1×2, processada false, fase 'liga') → `'proximo'`; com uma partida de copa 1×3 antes dela, o 2 fica liberado e o 3 `'proximo'` (Review Focus 5); partida `fase = 'base'` 1×2 não bloqueia.
  - parceria pedida por 1 e aceita por 2: tudo vira `null` mesmo fechados, com `'hoje'` e com `'proximo'`; `adversarios_de_amistoso(1)` marca `parceiro = true`.
  - `iniciar_amistoso(1,4,…)` rejeita com /sem dirigente/; `iniciar_amistoso` com `auth.uid()` = u2 agindo pelo clube 1 rejeita /Sem permissão|não é seu/.
  - `iniciar_amistoso` devolve a tática de amistoso do 2 quando existe, a de `taticas` quando não, null sem nenhuma.
  - `gravar_amistoso`: u1 grava uma vez; segunda vez rejeita; u2 rejeita.
  - trocar o dono do clube 2: `taticas_amistoso` dele some, parcerias somem, `aceita_amistoso = false` (Review Focus 4).
  - u3 não lê a linha do amistoso 1×2 (`set role authenticated` + uid u3 → 0 linhas).
- [ ] **Step 2: Rodar e ver falhar.** `node ferramentas/teste_amistosos_sql.mjs` → erro de arquivo inexistente.
- [ ] **Step 3: Escrever `supabase/165_amistosos.sql`** com as interfaces acima. Cabeçalho: "Precisa do 100_tatica_da_base.sql (eh_admin, padrão de RLS). Depois: publicar o site. A função rodada não muda."
- [ ] **Step 4: Rodar e ver passar.** Esperado: `amistosos (165): ok`. Depois `node ferramentas/testes.mjs` → tudo ok.
- [ ] **Step 5: Commit** (`supabase/165_amistosos.sql`, `ferramentas/teste_amistosos_sql.mjs`).

### Task 2: banco.js

**Files:**
- Modify: `src/banco.js` (perto de `minhaTaticaDaBase`, linha ~345)

**Interfaces:**
- Consumes: as RPCs e tabelas da tarefa 1.
- Produces (todas devolvem `undefined` quando a tabela/RPC não existe, no padrão de `minhaTaticaDaBase`):
  - `minhaTaticaDeAmistoso(clubeId) → { dados, atualizada_em } | null | undefined`, `salvarTaticaDeAmistoso(clubeId, dados)`
  - `adversariosDeAmistoso(clubeId) → [{ clube_id, motivo, parceiro }]`
  - `iniciarAmistoso(clubeId, desafiadoId, mando) → { id, semente, tatica }`
  - `gravarAmistoso(id, { placar, resumo, partida, relatorio })`
  - `amistososDoClube(clubeId, { desde }) → linhas sem partida/relatorio` (histórico e Central), `amistosoCompleto(id) → linha inteira`
  - `aceitarAmistosos(clubeId, aceita)`, `pedirParceria`, `responderParceria`, `desfazerParceria`, `parceriasDoClube(clubeId)`, `marcarAmistososVistos(clubeId, ids)`
- `MOTIVO_AMISTOSO = { fechado: "não aceita amistosos", voce_fechado: "marque \"Aceitar amistosos\" para desafiar dirigentes", hoje: "já jogaram hoje", proximo: "é o próximo adversário oficial" }` exportado daqui.

- [ ] **Step 1: Escrever as funções** (wrappers finos de `sb.rpc`/`sb.from`, como os vizinhos).
- [ ] **Step 2: Conferir importando no Node:** `node -e "import('./src/banco.js').then(B=>console.log(typeof B.iniciarAmistoso, typeof B.MOTIVO_AMISTOSO))"` → `function object`.
- [ ] **Step 3: Commit.**

### Task 3: src/amistoso.js (o jogo e o bot de estilo)

**Files:**
- Create: `src/amistoso.js`
- Test: `ferramentas/teste_amistoso.mjs`

**Interfaces:**
- Consumes: `taticaDoDirigente`, `taticaBot` (`src/rodada.js`, `src/bot.js`), `prepararTime`, `simularPartida` (`src/motor.js`), `criarRng` (`src/rng.js`), `montarRelatorio` (`src/relatorio.js`), `gerarElenco`, `PERFIS` (`src/gerador.js`), `ESTILO_DO_PERFIL` (`src/bot.js`).
- Produces:
  - `taticaParaAmistoso(dadosAmistoso, dadosLiga, elenco, opcoesBot) → { escalacao, banco, instrucoes, origem }`: tenta `taticaDoDirigente(dadosAmistoso)`, depois `dadosLiga`, depois `taticaBot(elenco, opcoesBot)`; `origem` ∈ `"tática de amistoso" | "tática do campeonato" | "tática de bot"`.
  - `elencoDoBot(estilo, nivel) → elenco`: `gerarElenco` com semente fixa por estilo (`ESTILOS_DE_BOT.indexOf(estilo) + 1000`), perfil = estilo, nível = `Math.round(nivel)`.
  - `ESTILOS_DE_BOT = Object.keys(ESTILO_DO_PERFIL)` (equilibrado, tecnico, fisico, veloz, tatico).
  - `jogarAmistoso({ casa: { nome, tatica }, fora: { nome, tatica }, semente }) → { partida, relatorio, placar, resumo }`: `simularPartida(criarRng(semente), …, { regrasT1: true })` sem clima; `relatorio = montarRelatorio(partida, [3, 3])`; `resumo = { xg, posse, chutes }` tirado de `partida.xg`/`partida.estat`; os papéis da tática entram como estão.
  - `partidaParaGravar(partida) → objeto` com só os campos que o replay e `htmlRelatorio` usam (`placar, xg, estat, lances, eventos, narracao, jogadores, ordens, acrescimos, duracao, penaltis`).

- [ ] **Step 1: Escrever `teste_amistoso.mjs`:**
  - mesma semente → mesmo `placar` e mesma `narracao`; sementes diferentes em 20 jogos → pelo menos 2 placares diferentes.
  - `taticaParaAmistoso(null, null, elenco, {})` → `origem === "tática de bot"` e 11 titulares (Review Focus 1).
  - tática de amistoso citando um id que não está no elenco → cai para a do campeonato; sem a do campeonato → bot (Review Focus 3).
  - um titular com `papel: "apoiador"` no DR chega a `prepararTime` com o papel (o jogo com e sem o papel, mesma semente, sai diferente em pelo menos 1 de 20 sementes).
  - `elencoDoBot("tecnico", 30)` duas vezes → mesmos ids e atributos; `taticaBot(elencoDoBot("tecnico",30), { perfil: "tecnico" }).instrucoes.passe === "curto"`.
  - `JSON.stringify(partidaParaGravar(p)).length < 80000`.
- [ ] **Step 2: Rodar e ver falhar** (módulo inexistente).
- [ ] **Step 3: Implementar `src/amistoso.js`.**
- [ ] **Step 4: Rodar e ver passar** (`amistoso: ok`), depois `node ferramentas/testes.mjs`.
- [ ] **Step 5: Commit.**

### Task 4: ui-escalacao.js — modo amistoso e papel escondido na liga

**Files:**
- Modify: `src/ui-escalacao.js` (`montarEscalacao` linha 103; carga online 346-375; `rotuloDoPapel` 449; `htmlPapeisDaVaga` 456)
- Modify: `src/papeis.js` (função pura nova)
- Test: `ferramentas/teste_papeis_tatica.mjs` (acrescentar)

**Interfaces:**
- Produces:
  - `papeisVisiveis({ amistoso, temporada }) → boolean` em `src/papeis.js`: `amistoso || temporada == null || temporada >= PAPEIS_DESDE`.
  - `montarEscalacao(raiz, { online, sessao, cabecalho, amistoso = false })`: com `amistoso: true` lê/salva por `minhaTaticaDeAmistoso`/`salvarTaticaDeAmistoso`; sem tática de amistoso salva, começa da tática do campeonato (`minhaTatica`) e, sem ela, da de bot; não busca próximo jogo, prévia, prazo nem trava (`taticaFechada`); todos disponíveis (`fora: 0`); aviso "Tática de amistoso: não muda o time do campeonato."; sem o texto do custo de entrosamento.
  - Na tática da liga com `!papeisVisiveis(...)`: `rotuloDoPapel` e `htmlPapeisDaVaga` devolvem `""`; o desenho com e sem a bola não aparece; os papéis salvos continuam nos dados (não apagar).
  - Na tática da liga com papéis visíveis: botão "Copiar papéis da tática de amistoso" (copia `papel` das vagas com a mesma posição, índice a índice; não salva sozinho).

- [ ] **Step 1: Acrescentar asserts** em `teste_papeis_tatica.mjs`: `papeisVisiveis({ amistoso: false, temporada: 0 }) === false`, `({ amistoso: true, temporada: 0 }) === true`, `({ amistoso: false, temporada: PAPEIS_DESDE }) === true`, `({ amistoso: false, temporada: null }) === true`.
- [ ] **Step 2: Rodar e ver falhar.** `node ferramentas/teste_papeis_tatica.mjs`.
- [ ] **Step 3: Implementar `papeisVisiveis` e o modo amistoso.**
- [ ] **Step 4: Rodar e ver passar**; conferir à mão com `python -m http.server 8797`: na Tática (temporada 0) o lateral não mostra papel; o mesmo componente com `amistoso: true` mostra os quatro.
- [ ] **Step 5: Commit.**

### Task 5: aba Amistoso em jogo.html e o replay

**Files:**
- Create: `src/ui-replay.js`
- Modify: `jogo.html` (barra de abas linha 3336; montagem da Tática ~405-417 como modelo; antigo amistoso 4999-5021 e cartões 3318-3350)

**Interfaces:**
- Consumes: tarefas 2, 3 e 4; `htmlRelatorio`, `htmlLance`, `ligarGraficos` (`src/ui-relatorio.js`, `src/ui-graficos.js`).
- Produces:
  - `abrirReplay(raiz, { partida, relatorio, nomes, clubes, segundos = 60 }) → { parar() }` em `src/ui-replay.js`: placar e minuto correndo, um `htmlLance` por lance no minuto dele, velocidades 0,5×/1×/2× e "Pular para o relatório"; no fim (ou ao pular) mostra `htmlRelatorio(relatorio, …)` e `ligarGraficos`.
  - Aba `["amistoso", "Amistoso", "🤝"]` depois de "Tática" na barra (linha 3336), com:
    1. a tática de amistoso (`montarEscalacao(el, { online: true, sessao, cabecalho: false, amistoso: true })`, montada só ao abrir a aba, como a Tática);
    2. "Aceitar amistosos" (caixa, `aceitarAmistosos`);
    3. adversários: os 5 bots de estilo (nome do estilo de `ESTILO_DO_PERFIL`) e os clubes de `adversariosDeAmistoso`, cada um com botão Jogar ou o motivo (`MOTIVO_AMISTOSO`) e "pedir parceria"/"parceiro";
    4. pedidos de parceria recebidos (aceitar/recusar) e parceiros (desfazer);
    5. histórico: placar contra cada clube (de `amistososDoClube`), com "ver" nos que ainda têm relatório (7 dias) e "não terminou" quando `placar` é nulo.
  - Jogar contra dirigente: `iniciarAmistoso` → `taticaParaAmistoso(minha tática de amistoso, minha do campeonato, …)` e `taticaParaAmistoso(r.tatica, null, elencoDele, …)` → `jogarAmistoso({ semente: r.semente, … })` → `gravarAmistoso` → `abrirReplay`. Erro do banco aparece com o texto dele.
  - Jogar contra bot de estilo ou clube sem dirigente: semente local `Math.floor(Math.random() * 2147483647)` (aqui, na tela, não no motor), nada gravado; clube sem dirigente usa `elencoDoClube` e tática de bot com o perfil dele; continua respeitando o motivo `'proximo'` da lista.
  - O antigo amistoso (4999-5021) sai; os cartões da Central (3318-3320, 3347-3350) viram um link "Jogar amistoso →" para a aba; o item da chegada (linha 2845) aponta para a aba.

- [ ] **Step 1: Escrever `src/ui-replay.js`.**
- [ ] **Step 2: Montar a aba e trocar o amistoso antigo.**
- [ ] **Step 3: Conferir no navegador** (`python -m http.server 8797`, logado; SQL 165 rodado no projeto ou banco local): salvar tática de amistoso com um Apoiador; jogar contra um bot de estilo (replay ~60 s, 2× ≈ 30 s, pular mostra o relatório); jogar contra um clube aberto; a segunda tentativa no mesmo dia mostra "já jogaram hoje"; o histórico mostra o jogo; a tática da liga não mudou.
- [ ] **Step 4: `node ferramentas/testes.mjs`** → tudo ok.
- [ ] **Step 5: Commit.**

### Task 6: Central do desafiado

**Files:**
- Modify: `jogo.html` (Central nova, `preencherCentralNova`; perto dos murais)

**Interfaces:**
- Consumes: `amistososDoClube(clube.id, { desde: início do dia de hoje em Brasília })` filtrando `desafiado === clube.id && !visto_em`; `amistosoCompleto`, `abrirReplay`, `marcarAmistososVistos`.
- Produces: um cartão por desafiante no dia: "{dirigente ou clube} jogou N amistoso(s) contra você hoje: xV yE zD" (do ponto de vista do desafiado), com link para cada jogo (abre `abrirReplay` com o gravado) e "ok" que chama `marcarAmistososVistos`. Sem amistosos novos, nada aparece. Jogo "não terminou" aparece como tal e não abre replay.

- [ ] **Step 1: Implementar o cartão.**
- [ ] **Step 2: Conferir no navegador** com duas contas (a do dono e uma de teste): jogar 2 amistosos com a conta A contra B; B vê um cartão só, com 2 jogos; abrir um mostra o mesmo placar e lances que A viu; "ok" some com o cartão.
- [ ] **Step 3: Commit.**

### Task 7: lançamento

**Files:**
- Modify: `versao.txt`, `atualiza.js` (pelo `publicar.py`), `C:\Users\PC\.claude\projects\C--Users-PC-Documents-ManagerOnline\memory\` (atualizar `servidor-teste.md`: amistoso por desafio entrou no site)

- [ ] **Step 1:** `node ferramentas/testes.mjs` → tudo ok; `python ferramentas/empacotar_funcao.py` e `git status supabase/functions` → **sem mudança** (antimeta: a função rodada não muda).
- [ ] **Step 2:** avisar o dono: rodar `supabase/165_amistosos.sql` no SQL Editor; conferir com o MCP `supabase-leitura` que as tabelas e o `cron.job` existem.
- [ ] **Step 3:** `python ferramentas/publicar.py`, commit e, com o ok do dono, push na main.
