# Reinício da liga (escala, treino, economia, temporada 0): plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** reiniciar a liga no domingo 25/10/2026 já com a escala nova (alvos 37–38 / 36–37 / 33–34), treino sem freio e contado por temporada, economia recalibrada e a temporada 0 que separa os 18 donos em A e B.

**Arquitetura:** a calibragem sai de um simulador de liga inteira (`ferramentas/sim_liga.mjs`) que usa os módulos reais de `src/`. Os valores aprovados vão para `src/` (reempacotados nas funções) e para uma migração SQL. O reinício é um RPC novo que apaga o estado da liga e grava os elencos que o `admin.html` gera. A virada T0→T1 usa uma regra nova em `virada.js`.

**Tecnologias:** módulos ES puros, testes `node:assert`, PGlite para SQL, Supabase (RPC `security definer`), `ferramentas/empacotar_funcao.py`.

**Design:** `docs/superpowers/specs/2026-10-23-reinicio-escala-treino-economia-design.md` (quem executa lê o design e este plano).

## Restrições globais

- Tudo em português do Brasil: código, comentários, interface, commits.
- Nada de `Math.random()` em treino, motor, virada ou geração usada no servidor; use `criarRng`.
- Mudou módulo de `src/` que o servidor usa (`MODULOS` / `MODULOS_MERCADO` em `ferramentas/empacotar_funcao.py`): rode `python ferramentas/empacotar_funcao.py` e faça o commit de `supabase/functions` junto.
- SQL: arquivo numerado novo (próximos livres: `143_`, `144_`), cabeçalho com o que faz, o que precisa antes e o que fazer depois. Idempotente. Teste PGlite que roda o arquivo duas vezes.
- Constantes que existem dos dois lados mudam juntas: `TETO_DE_FOLHA` ↔ `divisoes.teto_folha`, `REGUA_DE_FORA.teto` ↔ `teto_do_clube` (última versão em `supabase/140_tetos_com_duas_divisoes.sql`), `PREMIO_MINIMO` ↔ `PREMIOS`.
- Nota máxima continua 43 (45 com a folga). O motor da partida não muda.
- `node ferramentas/testes.mjs` precisa passar em todo commit (o hook pre-commit roda).
- Sem prazo rígido (o dono adia a virada se precisar). Ordem: Tarefas 1, 2, 5, 6 e 7 não dependem dos números. A Tarefa 3 depende da 1. A **Tarefa 4 é um ponto de parada**: o dono do projeto aprova o relatório antes da Tarefa 8.

## Foco da revisão

1. **Temporada 0 é falsa em JS:** `liga.temporada || 1`, `!temporada`, `temporada - 1` buscando histórico. Na T0 nada pode quebrar, nem cair para 1 em silêncio (Tarefa 7, passo da varredura).
2. **Bot ou dono inativo entre os semifinalistas da T0:** a vaga passa para outro dono ativo e sobem sempre 12 (Tarefa 6, testes).
3. **Grupo do país com tamanho diferente** (10 clubes, 18 rodadas): o treino por temporada usa as rodadas do grupo, não a divisão (Tarefa 1, teste).
4. **Reinício rodado duas vezes, ou parado no meio:** a RPC roda numa transação só e pode rodar de novo sem duplicar nada (Tarefa 7, teste PGlite).
5. **Tela de previsão do treino** ("sobe em cerca de N rodadas"): com o fator da temporada, a B mostra menos rodadas que antes, e não as mesmas (Tarefa 1, passo da tela).

---

### Tarefa 1: Treino sem freio e contado por temporada

**Arquivos:**
- Modificar: `src/treino.js` (`CONFIG_TREINO`, `alvoDaIdade`, `fatorDoCaminho`, `treinar`)
- Modificar: `ferramentas/empacotar_funcao.py` (laço do treino da liga, por volta da linha 385)
- Modificar: `jogo.html` (previsão do treino, por volta da linha 2656)
- Apagar: `ferramentas/sim_escada.mjs` (estuda o freio; o `sim_liga` da Tarefa 3 substitui)
- Testar: `ferramentas/teste_treino_temporada.mjs`

**Interfaces:**
- Produz: `CONFIG_TREINO.rodadasDeReferencia = 22`; `fatorDaTemporada(rodadas: number) => number`, que devolve `rodadasDeReferencia / rodadas` (1 quando `rodadas` é 0 ou não veio); `fatorDoCaminho(j, teto)` sem freio, igual a `max(minimo, teto − partida) / divisor`. `CONFIG_TREINO.freio` e `alvoDaIdade` deixam de existir.

- [x] **Passo 1: escrever o teste que falha**

```js
// ferramentas/teste_treino_temporada.mjs
import assert from "node:assert";
import { CONFIG_TREINO, fatorDaTemporada, pontosDaSessao, treinar } from "../src/treino.js";
import { gerarJogador } from "../src/gerador.js";
import { criarRng } from "../src/rng.js";
assert.equal(CONFIG_TREINO.freio, undefined);
assert.equal(fatorDaTemporada(22), 1);
assert.ok(Math.abs(fatorDaTemporada(14) * 14 - 22) < 1e-9);   // a B soma o mesmo que a A
assert.ok(Math.abs(fatorDaTemporada(18) * 18 - 22) < 1e-9);   // país de 10 clubes
assert.equal(fatorDaTemporada(0), 1);
// sem freio: o garoto de 16 anos adiantado treina o mesmo que um de 20 com a mesma nota e o mesmo teto
const j = gerarJogador(criarRng(1), { id: "x", pos: "MC", alvo: 22, idade: 16, nomes: { Brasil: { nomes: ["A"], sobrenomes: ["B"] } }, usados: new Set() });
assert.equal(pontosDaSessao({ ...j, idade: 16 }, { tal: 80 }), pontosDaSessao({ ...j, idade: 20 }, { tal: 80 }));
// uma temporada da B (14 sessões com o fator) rende o mesmo que uma da A (22 sessões), com tolerância de arredondamento
const temporada = (n) => { let x = { ...j, at: j.at.slice(), pts: null }; for (let s = 0; s < n; s++) { const r = treinar(x, { tal: 80, fator: fatorDaTemporada(n) }); if (r) x = { ...x, ...r }; } return x.at.reduce((t, v) => t + v, 0); };
assert.ok(Math.abs(temporada(14) - temporada(22)) <= 2);
```

Ajuste o `nomes` ao formato de `dados/nomes.json` se o gerador pedir outro.

- [x] **Passo 2: rodar e ver falhar**

Rode `node ferramentas/teste_treino_temporada.mjs`. Esperado: falha (`fatorDaTemporada` não existe).

- [x] **Passo 3: implementar em `src/treino.js`**

Tire `freio` do `CONFIG_TREINO`, apague `alvoDaIdade` e deixe `fatorDoCaminho(j, teto) = max(C.caminho.minimo, teto − C.caminho.partida) / C.caminho.divisor`. Crie `rodadasDeReferencia: 22` e `export const fatorDaTemporada`. Atualize o comentário do `CONFIG_TREINO.teto`, que ainda cita a Série C. O `treinar` já aceita `fator`; não mude a assinatura.

- [x] **Passo 4: servidor e tela**

No `empacotar_funcao.py`, o treino da liga passa `fator: fatorDaTemporada(rodadasDeLiga(<partidas do grupo>, p.grupo))`. Se o handler não tiver as partidas do grupo na mão, use `2 * (clubes do grupo − 1)`. Importe `fatorDaTemporada` na linha 56. O treino da liga de base (linha 219) fica como está.

No `jogo.html:2656`, multiplique `total` pelo `fatorDaTemporada` do grupo do clube (`2 * (clubes do grupo − 1)`) para a previsão bater com o servidor. Busque `freio` e `alvoDaIdade` em `jogo.html`, `admin.html` e `ferramentas/` e tire o que sobrar.

- [x] **Passo 5: rodar tudo**

Rode `node ferramentas/teste_treino_temporada.mjs && python ferramentas/empacotar_funcao.py && node ferramentas/testes.mjs`. Esperado: tudo passa.

- [x] **Passo 6: commit**

```bash
git add src/treino.js ferramentas/empacotar_funcao.py jogo.html ferramentas/teste_treino_temporada.mjs supabase/functions
git rm ferramentas/sim_escada.mjs
git commit -m "Treino sem o freio por idade e contado por temporada (A, B e países somam o mesmo)"
```

---

### Tarefa 2: Fim da divisão 3 e grupos A, B, C e D

**Decidido pelo dono do projeto:** não existe terceira divisão. A Série B é B1 = "B", B2 = "C" e B3 = "D". Se faltar vaga, cria-se a B4 = "E". O grupo "F" some (vira "D" no reinício, que reatribui todos os grupos). Os guardados (grupo "X") continuam como reserva de clubes para uma B4, mas não são divisão.

**Arquivos:**
- Modificar: `src/virada.js` (`GRUPOS_DA_B = ["B", "C", "D"]`; `divisaoDoGrupo`; `nomeCurto`; apagar `movimentosDaTransicao`, o parâmetro `transicao` de `planejarVirada` e as chaves `3` de `PREMIOS`, `NOTA_DO_JOVEM_POR_DIVISAO`, `TALENTO_DO_JOVEM_POR_DIVISAO`)
- Modificar: `src/economia.js` (chaves `3` de `TETO_DE_FOLHA` e `PREMIO_MINIMO`), `src/treino.js` (`ctSemDono` sem 3), `admin.html` (`GRUPOS`, `NIVEL_DO_NOVATO`, `BONUS_DA_C` e a caixa "transição" das linhas 231/566–567), `jogo.html` (colunas de troféus da linha 962 e da base da linha 1188: `["B", "C", "D"]` na Série B e fora a coluna da C), `src/banco.js` (`nomeBaseDoGrupo`: "Série B1/B2/B3/B4" para B/C/D/E)
- Modificar: `ferramentas/saude.mjs` (`"ABCDE".includes` → `ehDaLiga`)
- Modificar: `ferramentas/teste_piramide.mjs` (sai a parte da transição; a temporada normal passa a usar B, C e D)
- Apagar: `ferramentas/ensaio_virada_t14.mjs` (ensaio da transição que já passou)
- Criar (SQL): a parte de grupos entra no `143_reinicio_da_liga.sql` da Tarefa 7, com `divisao_do_grupo` (última versão em `supabase/114_piramide_t14.sql`) seguindo a regra JS e `delete from divisoes where divisao = 3`.
- Testar: `ferramentas/teste_grupos.mjs`

**Interfaces:**
- Produz: `divisaoDoGrupo(g)`: 1 para "A" e países; 2 para os demais, inclusive "X" e qualquer letra nova, como uma B4 "E". `export const ehDaLiga = g => g !== GUARDADO && !PAISES[g]` em `src/virada.js`, que o `saude.mjs` importa.

**Por que o guardado fica com divisão 2:** a coluna `divisao` não pode ficar vazia, e o guardado é excluído em todo lugar pelo grupo (`GUARDADO`), não pela divisão. O passo 4 confere isso.

- [x] **Passo 1: teste que falha.** `teste_grupos.mjs`: `divisaoDoGrupo` dá A→1, ARG→1, B/C/D/E→2, X→2; `GRUPOS_DA_B` é `["B","C","D"]`; `ehDaLiga("D") === true`, `ehDaLiga("X") === false`, `ehDaLiga("URU") === false`; nenhuma das constantes por divisão (`TETO_DE_FOLHA`, `PREMIO_MINIMO`, `PREMIOS`, `NOTA_DO_JOVEM_POR_DIVISAO`, `TALENTO_DO_JOVEM_POR_DIVISAO`, `CONFIG_TREINO.ctSemDono`) tem a chave 3; `nomeCurto`/`nomeBaseDoGrupo("D")` é "Série B3".
- [x] **Passo 2:** rode `node ferramentas/teste_grupos.mjs` e veja falhar.
- [x] **Passo 3:** faça as mudanças da lista de arquivos.
- [x] **Passo 4: varredura.** Rode `grep -rnE "divisao ?(===|==|=|<|>|<=|>=) ?[23]|divisao: ?[23]|\[3\]|\"F\"|'F'|Série C|\"D\", ?\"E\"" src/*.js *.html ferramentas/empacotar_funcao.py supabase/1[0-4]*.sql` e veja cada ocorrência que trata de divisão ou grupo. Nenhuma pode deixar um guardado entrar em liga, copa, base ou mercado. Onde o filtro for só `divisao = 2`, acrescente `grupo <> 'X'`. As funções SQL com esse filtro entram também no 143.
- [x] **Passo 5:** rode `node ferramentas/teste_grupos.mjs && python ferramentas/empacotar_funcao.py && node ferramentas/testes.mjs`.
- [x] **Passo 6:** commit, com a mensagem "Sem divisão 3: Série B em B, C e D (B4 = E se precisar); sai a transição T13→T14; saude.mjs conta o grupo D", com `supabase/functions` se mudou.

**Atenção na publicação:** esta tarefa só vai ao ar junto com o reinício (Tarefa 9). Com a liga de hoje (grupo "F" ainda vivo), `GRUPOS_DA_B` novo não acharia o B3.

---

### Tarefa 3: Simulador da liga madura

**Arquivos:**
- Criar: `ferramentas/sim_liga.mjs`
- Testar: `ferramentas/teste_sim_liga.mjs` (fumaça: 2 temporadas, semente fixa)

**Interfaces:**
- Consome: Tarefa 1 (`fatorDaTemporada`); `gerarElenco`, `gerarJogador`, `TALENTO_COMUM` (`src/gerador.js`); `jovensDaBase`, `CONFIG_BASE` (`src/base.js`); `CONFIG_SAFRA`, `SAFRA_DE_FORA`, `NOTA_DO_JOVEM_POR_DIVISAO`, `TALENTO_DO_JOVEM_POR_DIVISAO`, `PREMIOS`, `REGUA_DE_FORA`, `forcaDoOnze` (`src/virada.js`); `salarioDeMercado`, `TETO_DE_FOLHA`, `MAXIMO_INDIVIDUAL`, `PESO_DO_FORMADO`, `MANUTENCAO` (`src/economia.js`); `treinar`, `CONFIG_TREINO`, `ctDoClube` (`src/treino.js`).
- Produz: `export function simular({ semente, temporadas, nivel: { A, B, fora }, ajustes }) => [{ t, medidas }]` e a linha de comando `node ferramentas/sim_liga.mjs . [temporadas=10] [CHAVE.caminho=valor …]`. Os ajustes seguem o padrão do `sim_cera.mjs:8`, aplicados sobre o objeto exportado com aquele nome: `CONFIG_TREINO.pontosPorSessao=160`, `TETO_DE_FOLHA.1=22000`, `CURVA_DO_SALARIO=1.14`, `NIVEL.A=32`.

O que o simulador faz (o design, seção 1, tem os detalhes):
- **Pirâmide da T0:** A com 12 bots, B, C e D com 6 donos e 2 bots cada, e 4 países de 10 clubes. Os elencos saem de `gerarElenco` com `nivel` por série (`NIVEL.A`, `NIVEL.B`, `NIVEL.fora`). Esses três níveis são o botão do ritmo de 4 a 5 temporadas. Na T0→T1 vale a regra da Tarefa 6; depois, o acesso e descenso normal (sobe o vencedor do playoff, caem 3).
- **Partida:** força do onze mais `rng.normal(0, σ)` (`σ` sobrescrevível, começa em 1,2 como no `sim_escada`). O playoff segue o formato real: 3×6 e 4×5, semifinais, final.
- **Treino:** `treinar` por rodada de liga com `fator: fatorDaTemporada(rodadas)`. Joga quem está entre os 14 melhores. O CT é o do clube: dono sobe até `CT_DO_DONO` (sobrescrevível, padrão 4) em 3 temporadas; bot usa `ctSemDono`.
- **Envelhecimento, aposentadoria e reposição:** reaproveite o laço do `sim_escada` apagado (está no git: `git show HEAD~1:ferramentas/sim_escada.mjs`). Base e safra pelos módulos reais.
- **Economia por temporada:** receita = TV + patrocínio + bilheteria (torcida × ingresso × jogos em casa) + prêmios, com os valores da tabela `divisoes` (leia uma vez pelo MCP `supabase-leitura` e deixe como constante `DIVISOES` no topo, sobrescrevível); despesa = folha + manutenção. Caixa acumula.
- **Salário:** parâmetro `CURVA_DO_SALARIO` (k, padrão 1,12), ancorado na nota 41 com o mesmo salário de hoje. Fica no simulador, não em `src/` ainda: `salario(j) = salarioDeMercado(j) × (k/1,12)^(nota−41)`.
- **Dono no mercado:** mantém ~22 adultos dentro do teto. Quando sobra teto, troca o pior adulto pelo melhor livre (aposentados reciclados + gerados no nível da série) que caiba em `MAXIMO_INDIVIDUAL`. Profissionaliza o juvenil quando ele passa do 22º adulto. **Bot:** o jogo não usa teto para contratar; reproduza `mercadobots` só no essencial (repõe até `ELENCO_MINIMO_DO_BOT`).
- **Saída por temporada (uma linha, por série A/B/fora):** onze mediano; média dos reservas 12–16 e 17–22; tamanho mediano do elenco; idade mediana em que jovens de talento comum (≤ `TALENTO_COMUM`) e alto (≥ 90) passam de 35 e de 38; quantos ≥ 42; folha/teto mediano; caixa mediano e máximo; diferença de pontos do 1º para o 2º da A; posição média na A, na T1 e na T2, de quem subiu.

- [ ] **Passo 1: teste de fumaça que falha**

```js
// ferramentas/teste_sim_liga.mjs
import assert from "node:assert";
import { simular } from "./sim_liga.mjs";
const r = simular({ semente: 7, temporadas: 2 });
assert.equal(r.length, 3); // T0, T1, T2
assert.ok(r.every(x => x.medidas.A.onze > 20 && x.medidas.A.onze < 45));
assert.deepEqual(simular({ semente: 7, temporadas: 2 }), r); // determinístico
assert.equal(r[1].medidas.A.donos, 12); // a A da T1 é só de donos
```

- [ ] **Passo 2:** rode `node ferramentas/teste_sim_liga.mjs` e veja falhar (o módulo não existe).
- [ ] **Passo 3:** implemente `ferramentas/sim_liga.mjs`. A linha de comando só roda quando o arquivo é o script principal, para o teste poder importar sem imprimir nada.
- [ ] **Passo 4:** rode `node ferramentas/teste_sim_liga.mjs && node ferramentas/sim_liga.mjs . 10`. Esperado: o teste passa e saem 11 linhas de medidas.
- [ ] **Passo 5: calibrar o σ.** Compare a diferença de pontos do 1º para o 2º e a proporção de vitórias do favorito na A com a T14 real (`node ferramentas/saude.mjs .`). Anote o σ escolhido no topo do arquivo.
- [ ] **Passo 6:** commit, com a mensagem "sim_liga: simulador da liga inteira para a calibragem do reinício".

---

### Tarefa 4: Calibragem e relatório (PONTO DE PARADA)

**Arquivos:**
- Criar: `docs/superpowers/specs/2026-10-24-calibragem-do-reinicio.md`

- [ ] **Passo 1:** com `sim_liga`, procure valores que batam os alvos do design na T5–T10, com média de 5 sementes. Os parâmetros: `CONFIG_TREINO.pontosPorSessao`, `caminho.divisor`, `ritmoDaIdade` (só se a idade de chegada errar), `CONFIG_BASE.nota`, `NOTA_DO_JOVEM_POR_DIVISAO`, `TALENTO_DO_JOVEM_POR_DIVISAO`, `CONFIG_SAFRA`, `SAFRA_DE_FORA`, `REGUA_DE_FORA.nota/talento`, `CURVA_DO_SALARIO` (13–15%), `TETO_DE_FOLHA` 1 e 2, `REGUA_DE_FORA.teto`, receitas das `divisoes`, `PREMIOS`, `ctSemDono`, `NIVEL.A/B/fora`.
- [ ] **Passo 2:** escreva o relatório. Ele traz uma tabela de alvo × resultado para cada linha da tabela de Objetivos do design, os valores novos ao lado dos atuais e a curva de nota por idade (talento comum e alto). Traz também o caixa: se ele acumula, descreva o problema e 2 correções possíveis, **sem aplicar nenhuma** (o design manda que esse ponto volte ao dono do projeto).
- [ ] **Passo 3:** commit do relatório e **pare**. Mostre ao dono do projeto e espere a aprovação dos números e da correção do caixa. A Tarefa 8 só começa depois.

---

### Tarefa 5: Escolha dos grupos da temporada 0

**Arquivos:**
- Modificar: `src/virada.js` (função nova, perto de `movimentosDaTransicao`)
- Testar: `ferramentas/teste_reinicio.mjs` (criar; a Tarefa 6 acrescenta casos)

**Interfaces:**
- Produz: `export function gruposDoReinicio({ rng, clubes }) => { [clubeId]: grupo }`. `clubes`: `[{ id, grupo, dono }]`, todos os clubes da liga. Regras:
  - países mantêm o grupo;
  - os clubes do Brasil com dono, embaralhados, vão em rodízio para `GRUPOS_DA_B`, 6 por grupo;
  - os bots do Brasil (qualquer grupo que não seja país), embaralhados: os 12 primeiros vão para "A", os seguintes completam cada grupo da B até 8 e o resto vai para `GUARDADO`.
  - Mais de 24 donos: abre-se o grupo "E" (B4) e os grupos da B são completados com bots até 8 cada; se faltarem bots, erro claro ("faltam N clubes guardados para a B4"). Até 24 donos: 3 grupos, com os donos distribuídos o mais igual possível.

- [x] **Passo 1: teste que falha.** Com 18 donos e 32 bots do Brasil (ids e grupos como na liga de hoje: A 12 donos; B 1, C 1 e F 4 donos; X 14) mais 40 de países, chame `gruposDoReinicio({ rng: criarRng(3), clubes })` e confira: "A" tem 12 clubes, todos bots; B, C e D têm 8 cada, com 6 donos; nenhum clube fica em "F"; X tem 14; todo país manteve o grupo; mesma semente dá o mesmo resultado. Casos extras: 19 donos (B + C + D somam 24, com os 19 donos, 6 ou 7 por grupo); 26 donos (abre "E", 4 grupos de 8, e o X diminui).
- [x] **Passo 2:** rode `node ferramentas/teste_reinicio.mjs` e veja falhar.
- [x] **Passo 3:** implemente.
- [x] **Passo 4:** rode `node ferramentas/teste_reinicio.mjs` e veja passar.
- [x] **Passo 5:** commit, com a mensagem "Reinício: sorteio dos grupos da temporada 0 (donos na B, 6 por grupo)".

---

### Tarefa 6: Virada T0→T1 (sobem os 4 semifinalistas de cada grupo)

**Arquivos:**
- Modificar: `src/virada.js` (`movimentosDoReinicio` novo; `planejarVirada` escolhe essa regra quando `liga.temporada === 0`)
- Testar: `ferramentas/teste_reinicio.mjs`

**Interfaces:**
- Consome: `movimentos` (mesma forma de saída), `GRUPOS_DA_B`, `vencedorDoGrupo`.
- Produz: `export function movimentosDoReinicio({ clubes, grupos, partidas, resultados, ativo }) => { destino, lista }`, no mesmo formato de `movimentos`. Regras, todas do design:
  - semifinalistas de cada grupo da B = clubes que aparecem em partidas `fase === "semi"` do grupo;
  - sobem os semifinalistas que forem donos ativos (`ativo(clube)`);
  - cada vaga perdida (bot ou dono inativo) vai para o dono ativo do mesmo grupo, fora das semis, com melhor `posicao`; se o grupo não tiver nenhum, para o melhor dono ativo dos outros grupos, por `posicao` e depois `pontos`;
  - sobem no máximo 12; se não houver 12 donos ativos, sobem os que houver e a A é completada pelos bots da A melhor colocados, que ficam;
  - os bots da A que não ficam descem em serpentina pela classificação da A (1º→B, 2º→C, 3º→D, 4º→D, 5º→C…; com a B4, por `GRUPOS_DA_B` mais "E"), com `caiu: true`;
  - os que ficaram na B mantêm o grupo, e cada grupo da B termina com 8.
  - `destino`: "subiu" / "caiu" / "ficou" / "campeão" (1º da A), como em `movimentos`.

- [x] **Passo 1: testes que falham** (no mesmo arquivo da Tarefa 5)

```js
// T0: A = bots 1–12; B, C e D com donos 101–106 / 201–206 / 301–306 e bots 107–108 / 207–208 / 307–308.
// Semis: B {101, 102, 103, 107}, C {201, 202, 203, 204}, D {301, 302, 303, 304}; 107 é bot; o dono 104 é o melhor fora das semis na B.
const m = movimentosDoReinicio({ clubes, grupos, partidas, resultados, ativo: c => !!c.dono && c.id !== 304 });
const subiram = m.lista.filter(x => x.grupo === "A").map(x => x.clube_id).sort((a, b) => a - b);
assert.deepEqual(subiram, [101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, /* vaga do 304 inativo */ 305]);
assert.equal(m.lista.filter(x => x.caiu).length, 12);
for (const g of ["B", "C", "D"]) assert.equal(grupoFinal(m, g).length, 8);
assert.equal(m.destino[1], "campeão");
```

Acrescente o caso "só 10 donos ativos": sobem 10, os 2 bots melhor colocados da A ficam e caem 10.

No caso de cima, o 305 só entra se for o dono ativo de D fora das semis com melhor posição. Monte as `posicao` para isso.
- [x] **Passo 2:** rode e veja falhar.
- [x] **Passo 3:** implemente `movimentosDoReinicio` e, em `planejarVirada`, chame-a no lugar de `movimentos` quando `liga.temporada === 0`.
- [x] **Passo 4:** rode `node ferramentas/teste_reinicio.mjs && node ferramentas/teste_piramide.mjs` e veja passar.
- [x] **Passo 5:** rode `python ferramentas/empacotar_funcao.py` (por garantia; `virada.js` não está nos `MODULOS` hoje, então nada deve mudar) e faça o commit com a mensagem "Virada da temporada 0: sobem os semifinalistas donos de cada grupo da B".

---

### Tarefa 7: Botão de reinício (RPC nova + admin)

**Arquivos:**
- Criar: `supabase/143_reinicio_da_liga.sql`
- Criar: `ferramentas/teste_reinicio_sql.mjs`
- Modificar: `src/banco.js` (trocar `guardarEstadoInicial` e `reiniciarTeste` por `reiniciarLiga`)
- Modificar: `admin.html` (botão "Reiniciar o teste" → "Reiniciar a liga (temporada 0)"; tirar "Guardar estado inicial" e a caixa `sortear`)

**Interfaces:**
- Consome: `gruposDoReinicio` (Tarefa 5); `elencoNovo` (`admin.html:88`, já com contrato); `NIVEL_DO_REINICIO` (Tarefa 8; até lá, `{ A: 30, B: 30, fora: 30 }` como valor provisório no `admin.html`).
- Produz: SQL `public.reiniciar_liga(p_liga bigint, p_grupos jsonb, p_jogadores jsonb) returns text` (`p_grupos`: `{ "id": "grupo" }`; `p_jogadores`: lista no formato de `elencoNovo` + `clube_id`), só para admin. JS: `reiniciarLiga(ligaId, grupos, jogadores)`.

O que a RPC faz, numa transação:
1. `eh_admin()`, senão erro.
2. Apaga todo o estado de jogo da liga: `partidas` (com `resultados` e `lances`), `historico`, `historico_lances`, `jogadores_historico`, `estatisticas_historico`, `premios_individuais`, `base_campeoes`, `base_jogos`, `confianca_historico`, `economia_temporadas`, `fundo_resumo`, `finais_nas_sedes`, `lancamentos`, `obras`, `transferencias`, `propostas`, `pre_contratos`, `ofertas_livres`, `relatorios`, `revelados`, `safras`, `metas`, `patrocinios`, `treinadores`, `escalacoes`, `taticas`, `taticas_base`, `ordens_partida`, jogadores (com `jogadores_ocultos`) dos clubes da liga e os livres (`livre_liga`). Antes de escrever, confira a lista pelo MCP (`information_schema`) e a ordem das FKs. Tabela nova que não estiver aqui vira pergunta, não palpite.
3. Grava os grupos (`p_grupos`), `divisao = divisao_do_grupo(grupo)`, e devolve as colunas de estado de cada clube ao padrão (as do `reiniciar_teste` atual mais as criadas depois; liste-as pelo `information_schema.columns` de `clubes`). Ficam só a identidade (`nome`, `sigla`, `escudo` e o escudo enviado, `uniforme`, cores) e o `dono`. Torcida = `torcida_base` da divisão; caixa = 5000 em `financas`.
4. Insere `p_jogadores` (com os talentos em `jogadores_ocultos`, como o `aprovar_pedido` faz).
5. `ligas`: `temporada = 0`, sem pausa, `fundo_taca = 0`, e zera o que mais houver da temporada (confira as colunas).
6. Remove `reiniciar_teste`, `guardar_estado_inicial` e a tabela `estado_inicial` (`drop … if exists`).

- [x] **Passo 1: teste PGlite que falha.** Siga o padrão dos `teste_*_sql.mjs` existentes: stub de `eh_admin()`, das tabelas tocadas com as colunas mínimas e de `divisao_do_grupo`. Casos: (a) depois de `reiniciar_liga`, as tabelas de estado da liga ficam vazias, os clubes têm o grupo pedido, `ligas.temporada = 0` e o caixa é 5000; (b) nome e escudo do dono continuam iguais; (c) chamada repetida dá o mesmo resultado; (d) não-admin recebe erro; (e) o arquivo roda duas vezes sem erro.
- [x] **Passo 2:** rode `node ferramentas/teste_reinicio_sql.mjs` e veja falhar.
- [x] **Passo 3:** escreva `143_reinicio_da_liga.sql`, com cabeçalho: "Precisa do 142. Depois: publicar o site; o botão está no admin."
- [x] **Passo 4: admin.** O clique pede confirmação explicando que apaga tudo, até o histórico das T1–T14, e que convém fazer o backup antes. Depois: `gruposDoReinicio` → `elencoNovo(rng, nivel, pais, 0)` para cada clube fora de X (nível por série, `NIVEL_DE_FORA` substituído por `NIVEL_DO_REINICIO.fora`; clubes de X ganham elenco de nível B) → `reiniciarLiga` → `limparTreinadores` e `zerarConfianca` (como hoje) → "Agora gere o calendário."
- [x] **Passo 5: varredura da temporada 0.** Rode `grep -rnE "temporada \|\||!temporada|temporada - 1|temporada-1|\.temporada \?" src/*.js *.html ferramentas/empacotar_funcao.py supabase/1[0-4]*.sql` e veja cada ocorrência. Quando 0 virar 1, ou "sem temporada", em silêncio, corrija com `?? 1` ou comparando com `null`. Liste no commit o que mudou.
- [x] **Passo 6:** rode `node ferramentas/testes.mjs`. Esperado: tudo passa.
- [x] **Passo 7:** commit, com a mensagem "143: reinício da liga na temporada 0 (donos na B, estado inicial novo); sai o reiniciar_teste".

---

### Tarefa 8: Aplicar os números aprovados

Só depois da aprovação da Tarefa 4. Os valores vêm do relatório aprovado.

**Arquivos:**
- Modificar: `src/economia.js` (`salarioDeMercado` com o fator novo e a âncora na nota 41; tabela do comentário; `TETO_DE_FOLHA`; `PREMIO_MINIMO`)
- Modificar: `src/virada.js` (`PREMIOS`, `REGUA_DE_FORA`, `CONFIG_SAFRA`, `SAFRA_DE_FORA`, `NOTA_DO_JOVEM_POR_DIVISAO`, `TALENTO_DO_JOVEM_POR_DIVISAO`)
- Modificar: `src/treino.js` (`CONFIG_TREINO` calibrado, `ctSemDono`), `src/base.js` (`CONFIG_BASE.nota`)
- Modificar: `admin.html` (`NIVEL_DO_REINICIO`; `NIVEL_DO_NOVATO` só com 1 e 2)
- Criar: `supabase/144_valores_do_reinicio.sql` (`divisoes`: teto, TV, patrocínio, ingresso, torcida base; `teto_do_clube` com o teto dos países novo; correção do caixa, se aprovada)
- Testar: `ferramentas/teste_salario.mjs`, `ferramentas/teste_valores_do_reinicio_sql.mjs`

- [ ] **Passo 1: testes que falham.** `teste_salario.mjs`: o salário de mercado de um adulto de nota 41 continua igual ao de hoje (±1); nota 40 ÷ nota 39 = o fator aprovado (±0,005); nota 41 com 20 anos = 0,8 × o adulto; `MAXIMO_INDIVIDUAL × TETO_DE_FOLHA[1]` ≥ o salário da nota 43 (o craque cabe). `teste_valores_do_reinicio_sql.mjs`: depois do 144, `divisoes` da divisão 1 e 2 têm os valores aprovados, `teto_do_clube` de um clube de país devolve o teto novo e o arquivo roda duas vezes.
- [ ] **Passo 2:** rode os dois testes e veja falhar.
- [ ] **Passo 3:** aplique os valores do relatório, sem inventar nenhum.
- [ ] **Passo 4:** rode `node ferramentas/sim_liga.mjs . 10` sem ajustes: tem que reproduzir a tabela aprovada.
- [ ] **Passo 5:** rode `python ferramentas/empacotar_funcao.py && node ferramentas/testes.mjs`.
- [ ] **Passo 6:** commit, com a mensagem "144: valores do reinício (salário, tetos, receitas, treino, base, safra)", incluindo `supabase/functions`.

---

### Tarefa 9: Publicação e roteiro do domingo

**Arquivos:**
- Criar: `docs/superpowers/plans/2026-10-25-roteiro-da-virada.md` (checklist para o administrador)

- [ ] **Passo 1:** escreva o roteiro na ordem: (1) terminar a T14 (sem virada: o reinício apaga o histórico); (2) backup no admin (`fazerBackupNoServidor`) e cópia completa; (3) rodar o 143 e o 144 no SQL Editor (o 143 já traz `divisao_do_grupo` nova e apaga a divisão 3 das `divisoes`); (4) republicar as funções `rodada` e `mercado`; (5) `python ferramentas/publicar.py` e push; (6) admin: "Reiniciar a liga" e gerar o calendário; (7) `node ferramentas/saude.mjs .`, conferindo a A com 12 bots, B/C/D com 6 donos e 2 bots, temporada 0 e onze mediano por série perto do `NIVEL_DO_REINICIO`.
- [ ] **Passo 2:** `python ferramentas/publicar.py`; commit e push para `main`, com a mensagem "Reinício da liga pronto: roteiro do domingo".

## Decisões do dono do projeto depois do plano

- O histórico da T1 à T14 é apagado no reinício (Tarefa 7, lista completa).
- Não existe terceira divisão; se faltar vaga, cria-se a B4 (Tarefas 2 e 5).
- Os grupos ativos passam a ser A, B, C e D (Tarefa 2).

## Roteiro por sessão (25/10, com o plano semanal curto)

A virada do dia 25/10 foi adiada (nenhuma tarefa estava feita). As migrações deste plano mudam de número: **143 → 149** (reinício da liga) e **144 → 150** (valores do reinício), porque 143 a 148 já foram usados.

Uma sessão por linha. Antes de cada uma: `/clear`, `/model` indicado e colar o pedido. No fim de cada sessão: marcar os `[x]` da tarefa, fazer o commit e dizer qual é a próxima.

| # | Tarefas | Modelo | Pedido para colar |
|---|---------|--------|-------------------|
| 1 | 2 | Sonnet | Execute a Tarefa 2 do plano `docs/superpowers/plans/2026-10-23-reinicio-escala-treino-economia.md` (veja o roteiro por sessão no fim). |
| 2 | 1 | Sonnet | Execute a Tarefa 1 do plano do reinício (mesmo arquivo). |
| 3 | 3 e 4 | Opus | Execute as Tarefas 3 e 4 do plano do reinício e pare no relatório para eu aprovar. **Não limpar o chat no meio.** |
| 4 | 5 e 6 | Sonnet | Execute as Tarefas 5 e 6 do plano do reinício. (Pode ser feita enquanto o relatório da sessão 3 espera a aprovação.) |
| 5 | 7 | Sonnet | Execute a Tarefa 7 do plano do reinício (migração 149). |
| 6 | 8 | Sonnet | Execute a Tarefa 8 do plano do reinício com os números aprovados no relatório (migração 150). |
| 7 | 9 | Sonnet | Execute a Tarefa 9 do plano do reinício. |

Ficam para depois da virada: a troca de modelo e cidade do estádio (anotações) e o ajuste das notas dos defensores.
