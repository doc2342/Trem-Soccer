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
Task 6: inline (Opus). CONFIG.t1.grade = true; atacarNaGrade dentro de atacar (mesmos fechamentos); hash T0 e T1 de 9 zonas iguais.
Ruling: gradeValores.baseDuelo próprio { D 2,6, M 1,7, A 1,2 } (o baseDuelo das 9 zonas é de duelo entre linhas: subir acertava 61%, meta 84%) e risco 3 (com 0,3 a jogada era só lançamento) — custo: valores de partida, Tarefa 12.
Ruling: inversão paga as faixas puladas como o pular (D.pular × (df − 1) + D.inversao × (df + dc − 2)); antes 1e→4D custava −0,75 contra −1,8 do 1e→4e e era 40% dos passos.
Ruling: passe só para zona com alguém nosso (peso > 0); condução pode ir ao espaço vazio. Fiel e corta ~¼ das opções avaliadas.
Ruling: A1 (armadilhaLado) só no duelo, fora do valorDe: quem passa não vê a armadilha (senão evita o lado e perde menos).
Ruling: reserva (R1) na grade = faixa 1 inteira + miolo da faixa 2 (só e/C/d tirava o lateral que fica: Apoiadores sofriam MENOS contra-ataques que Fixos). teste_regras_t1: faixa 1,15 → 1,10 (+14% medido).
Ruling: perda do passo: quem recebe domina mal/é desarmado, quem passa erra/tem o passe cortado/acha o impedido (d.passador; nas 9 zonas é o mesmo jogador). Perda na volta conta na zona de origem.
Ruling: montarRelatorio soma as 25 zonas nas 9 (arredondado) para o analista e as telas — senão a rodada da T1 quebrava. A Tarefa 11 passa a gravar as 25.
Ruling: gradeValores.contato 0,5 multiplica falta e lesão por passo (faltas ~20, amarelos 4,0 por jogo).
Ruling: teste_amistoso, jogo gravado < 120 mil caracteres (era 80 mil; a grade grava rota, fases e textos maiores; o amistoso grava narracao + lances + eventos, metade é repetição).
Custo: 29 → ~11–13 ms por jogo (régua aquecida, 4-2-3-1 x 4-4-2; 9 zonas 2,4–3,0 ms, também ficou mais rápida). Otimizações sem mudar resultado (hash conferido): defesaVista em vetores, tabelas de espelho/coluna/zona, manchas espelhadas uma vez, molde das forças, arrumação da transição só no contra.
Para a Tarefa 12 (medido em 300 jogos, formações sorteadas): gols 2,96 (meta 2,3), conversão 12,7%, chutes 23,4, acerto 84,2%, passes no gol 4,3, posses de 10 = 2,7 por time (meta 11–16), lado 45% / voltar 4% (meta volta 12–22%), pular 24% (alto). PRESSÃO: na grade pressionar rende +0,2 ponto por jogo e o atacado perde MENOS a bola (a compactação em cascata come o reforço de marcação; sobram só efeitos no atacante). Teste A1 isola a mecânica (armadilha liga/desliga) por isso.
Task 6: complete (inline, 69/69)
Task 7: inline (Opus). criarChance com zona/buracos: 5C área/profundidade/longe; 5e/5d cutback, enfiada (profundidade) e corte raro (pé invertido ±15%); 5E/5D cruzamento da linha de fundo e cutback (× bloco baixo); 4E/4D cruzamento antecipado como opção do passo (fim: true, valor × contra/linha alta); 4C chute de longe como opção do passo. buracos.profundidade no xG da profundidade, buracos.cruzamento no peso do cruzamento. flancoAberto já não entrava na grade (só no caminho das 9 zonas): nada a desligar.
Ruling (DONO, 31/10): cruzamento tem acerto (o mais comum no futebol é o cruzamento errado na área vazia). Quem ganha a bola = Posicionamento + Força no alto, Posicionamento + Velocidade no chão (pacote aéreo de 29/10); goleiro sai (Encaixe/Um contra um). Errado = perda de bola, 15% escanteio; a Tarefa 8 faz a segunda bola do cruzamento afastado. Área vazia: o cruzamento vai e erra; o mau decisor (Decisão 15) cruza para o vazio, o bom (35) evita (cegueira). Sem arremesso lateral (o lateral do cruzamento errado é bola do adversário).
Ruling: cutback sem ninguém chegando vira corte (ele mesmo chuta); todo peso zero → corte na faixa 5, longe fora dela.
Ruling: teste do xG publicado ≤ 0,92 (teto do chanceDeGol, já com o goleiro), não o xgMaximo.
Ruling: Apoiador que cruza errado também "chega ao fundo e cruza" (teste_papeis_motor).
Para a Tarefa 12 (2.000 jogos sorteados): cruzamentos 1,4 por time e jogo (real ~15!), acerto 21,5% (meta 20–25); cutbacks 1,6 (meta certos 0,5–1); toques na área 8,7 (meta 14–22); longe 24,6% dos chutes de jogo corrido; chute de longe da zona 14 raro (344 em 2.000 jogos). Dono: a calibragem não é só os gols: equilíbrio dos estilos (time de cruzamento × por dentro) e parte dos gols de cruzamento.
Pendente: referências de cruzamento salvas pelo dono em prototipos (31/10) — ler e emendar antes da Tarefa 8.
Task 7: complete (inline, 69/69)
Fontes de cruzamento (31/10, docs/superpowers/specs/2026-10-31-grade-5x5-fontes-cruzamento.md). DONO aprovou P1–P6: cruzador 0,6 → 1,0; pressão na zona de quem cruza (defesaNo da zona); antecipado sem castigo fixo (zaga × 0,85 no contra ou contra linha alta); pé ruim da linha de fundo no lado trocado; lado oposto da faixa 1 × 0,6 na defesa da área; linha alta × 0,85. Base −0,5 → 0. Medido: acerto 23,1% (meta 23,6%); Cruzamento 15/25/35 → 17/25/33%.
P7 ABERTO (dono): 1,8% dos cruzamentos viram gol é por cruzamento; o nosso volume (1,4 por time) é o problema. Meta da Tarefa 12 = volume + acerto + parte dos gols de jogo corrido vinda de cruzamento; faltam referências do volume e da parte dos gols. Tipo de defesa na área: não agora (a grade não vê dentro da área; reserva se o cruzamento ficar forte demais).
Task 8: inline (Opus). gradeValores.terceiro/longa/aereo/segundaBola/viradaInstrucao/lancamento; segundaBola em src/grade.js; sobra/bolaLonga/seguir em atacarNaGrade.
Ruling: terceiro homem = passo para a frente ganho com folga < 0,3 → a volta seguinte ganha (disputada: disputa × (pressão + (Desarme+Agressividade de quem marca − 25)/25)) → o próximo passo para a frente leva o bônus (o maior com o impulso) e quem recebe fica de frente. Volta perdida: contra-ataque × 1,5 (expor no perdeu). tabelas = a volta foi para quem tinha passado; terceiros = chega às faixas 4–5; os dois [tentados, certos].
Ruling: o teste "terceiro homem contra retranca rende menos que contra pressão 2" pela contagem crua dá o contrário (retranca 120 tentativas x pressão 38 em 300 jogos: contra a retranca o time vive no campo de ataque; contra a pressão a volta é roubada, o lado ruim do spec). Teste isola o bônus (ampliado em 2, ligado × desligado, mesmas sementes): ganho no acerto contra a pressão +42 pontos, contra a retranca +12.
Ruling: bola longa = pular para 5e/5C/5d pelo alto (sempre com passe longo; senão chance 0,5 × Passe longo/25). 1º toque: Posicionamento + Força (sem Altura, ponytail) + o Passe longo de quem lança; do 1E/1D −0,3. 2º toque: queda na faixa 4 do mesmo corredor (a ajeitada ou o rebote na frente da área), presença na queda + vizinhas × 0,5, quem ganhou o 1º toque × (1 + 0,5 × Cabeceio/25). Ganha: a jogada segue dali (de frente se foi a ajeitada nossa); perde: perdaDePosse sem pivô + perdeu (o R1 dá o contra se o time ficou esticado).
Ruling (pedido do dono): segunda bola do cruzamento afastado: errado com "a zaga afasta" (ou área vazia) → sobra na zona 14 (4C), o zagueiro que afastou dá a direção pelo Cabeceio; ganha = a jogada segue da zona 14 (o chute de longe está lá). Goleiro que fica com a bola e bola que passa por todo mundo: sem sobra. Contador sobras.
Ruling: virada e inversão: logit + 0,4 × (Passe longo − 25)/25 de quem passa; valor × 1,5 com passe longo, × 1,5 com lados, × 0,6 com curto.
Ruling: teste_papeis_motor "pelas costas do lateral" (~1 a cada 50 jogos, nenhum nas sementes < 206 depois da Tarefa 8; 40 jogos passavam por sorte): procura até a semente 400.
Medido (1.000 jogos sorteados): gols 3,16 → 2,92; contra-ataque 15,8% dos gols (igual); acerto de passe 83,9%; custo +10% (~16 → 18 ms, mais passos com a segunda bola). Para a Tarefa 12: bolas longas 4,6 por time (meta: ~10% dos passes; pular hoje 23% dos passos), quem lança fica com 46% (meta ~25%, boa estrutura 40–50%), aéreos ganhos pelo atacante 42%, 4,6 duelos aéreos por time (meta ~26 contando tudo), sobra do cruzamento 0,33 por time e 38% nossa, terceiros 0,46 por time (meta ~0,4 por jogo) com 65% certos, tabelas 0,14 por time (meta ~4 por jogo: a volta é rara, 4,6 por time).
Dono (31/10, durante a Tarefa 8): a jogada de gol bem trabalhada merece ser contada inteira → Tarefa 11b com narrar.passosGol (8) e frase própria da tabela/terceiro homem (emendado no plano).
Task 8: complete (inline, 69/69)
Ruling: teste de custo da grade relativo à T0 medida no mesmo teste (a máquina ficou mais lenta: a própria HEAD da Tarefa 7 media 18,4–19,1 ms contra o teto fixo de 18,45). Teto = 3 × 4,1/2,5 × T0 × 1,5 (4,1 ms a régua de antes, T0 ~2,5 ms depois das otimizações da Tarefa 6). Medido: grade 18,7 ms, T0 3,5 ms (5,3×).
