# SDD ledger — plan: docs/superpowers/plans/2026-10-31-grade-5x5.md
Escopo pedido pelo dono: Tarefas 0 a 3. Spec: docs/superpowers/specs/2026-10-31-grade-5x5-design.md.
Ruling: trabalhar direto na main (commits locais, sem push) — o dono pediu a execução na worktree da main; push só com o dono.

## Varredura prévia
| Tarefas | Produz / consome | Achado |
|---|---|---|
| T0 | teste de hash | coerente (usa FORMACOES/gerarOnze como teste_regras_t1.mjs) |
| T1 | grade.js geometria | coerente; teste nove.MC=4 bate com a regra do meio-espaço metade/metade |
| T2 | MANCHAS, manchasDoTime, mapasDoPapel(...,grade) | pede `CONFIG.grade.passagemPorDentro`, mas T3 define `CONFIG.grade` como booleano e papeis.js não lê CONFIG — CONFLITO |
| T3 | CONFIG.grade/gradeValores, recalcular | diz "CONFIG.t1.grade = true" e no passo 4 "fica false até a Tarefa 6" — CONFLITO interno |
| T0→T1..T3 | hash roda em toda tarefa | ok |
| T1→T2→T3 | ZONAS_GRADE, espelhoGrade, corredorDe, faixaDe, decisao | ok |

Ruling: T2 não mexe no CONFIG; T3 cria `CONFIG.gradeValores.passagemPorDentro = { "4D": -0.10, "5D": -0.10, "4d": 0.10, "5d": 0.10 }` e aplica no recalcular com a grade (onde hoje se aplica CONFIG.papeis.passagemPorDentro) — CONFIG.grade é booleano — custo: valor de partida, a calibragem ajusta.
Ruling: T3 grava `CONFIG.t1.grade = false` com comentário "a Tarefa 6 liga" — o passo 4 do plano manda; senão a T1 muda antes do laço da grade existir — custo: nenhum.

## Tarefas
Task 0: dispatched (base a8b7b91, sonnet)
Ruling: dono pediu T1–T3 inline (sem subagentes), uma revisão independente no fim.
Task 1: complete (b1a61e8, inline)
Task 2: complete (e0d6669, inline). Ruling: Fixo DR na grade = MANCHAS.DR (o Fixo é o padrão do DR, como a COBERTURA hoje); mapas dos papéis convertidos das 9 zonas, números de partida.
Task 3: inline. Ruling: compactação em cascata (faixa k contra a k−1 já compactada) — "a faixa adiantada sem cobertura atrás não segura" — custo: defesa das faixas 4–5 baixa (4-2-3-1: AC 32 → 14 somado em 9); conferir na Tarefa 12.
Ruling: alaPorLado na grade: fundo 1+lado, sobe para 2+lado ou fecha o 1C — tradução direta das 9 zonas.
Nota p/ Tarefa 12: def 1C+meios-espaços somados (DC em 9) 74 → 50 no 4-2-3-1; ataque D do centro 53 → 20 (zaga abre para os meios-espaços).
Task 3: complete (8a882c7, inline, 69/69)
Revisão T0-3: Important 1 (transição com todos na grade) corrigido; Minor 1b (goleiro antes da compactação) corrigido. Parked: zero em cascata em corredor sem ninguém na faixa 1 (fiel: sem cobertura atrás não segura; ver na T12); asserts de chaves em zonas/zonasDef; comentário no avaliarZonas.
Task 4: inline (Opus). Ruling: três corredores — o que sai de cada corredor livre = basculacao × a parte que não marca ninguém ali (1 − ameaça, como o livre de hoje) × distância da bola / 4 (o "desequilíbrio entre os lados" virou a distância: bola no centro, os lados soltam metade; no lado oposto, tudo); vai para os 3 ocupados pela defesa de cada um — custo: valor de partida, calibragem.
Ruling: empréstimo limitado pela falta (até o ataque da zona ou o piso da faixa); sem isso a zona vazia passava a vizinha. Quem pede ajuda não empresta; quem pegou não empresta; quem emprestou não pega. Ordem das zonas: faixa 1 de quem defende primeiro; corredores C, e, d, E, D.
Ruling: V.arrasto.folga = 0,85 (o embalo.narrar); a Tarefa 5 cria V.impulso.giro com o mesmo valor. Transição (T) arrumada com a bola no C. Bola no meio-espaço usa o defLado do lado vizinho (alaPorLado).
Medido (4-2-3-1 x 4-4-2 etc.): 2–8% da defesa muda de lugar; losango x 4-3-3 com pontas abre o cruzamento (laterais fecham por dentro).
Task 5: inline (Opus). Ruling: virada −1,0 (o plano dizia −0,6, mas aí ficava mais fácil que pular uma faixa, −0,9, contra a escada do próprio plano e do spec 7.1 e a meta de acerto 40% < 50%) — custo: valor de partida, calibragem.
Ruling: mesma faixa a 2+ corredores sem ser virada (E→C, e→D) = "lado" com ladoLonge −0,3 por corredor além do 1º; para trás só corredor ≤ 1 (ou virada). Do lado para dentro −0,2 em todo tipo menos voltar/virada.
Ruling: V.impulso.deFrente = 0,3 (o spec não dá; um pouco acima do teto do embalo 0,28 para pesar). prende = reto (subir/pular) pelo lado ou pelo centro sem ter girado (folga < giro); quem girou não fica preso.
Ruling: condução = entrada repetida em opcoesDoPasso com conduzir: true (subir/diagonal/lado). escolherPasso recebe sortear por parâmetro; valor ≤ 0 vira 1e-9 (todas ruins → iguais). pressaoAdv/mentalidadeAdv com padrão 0.
Task 5: complete (inline, 69/69)
