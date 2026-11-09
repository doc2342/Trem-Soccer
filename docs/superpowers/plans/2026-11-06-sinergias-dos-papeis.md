# Sinergias dos papéis (06/11)

Pedido do dono (06/11): (1) calibrar Apoiador, Mezzala e Box-to-box, que hoje deixam o time pior que o padrão e marcando menos;
(2) criar a cobertura entre papéis (o lateral Invertido cobre a subida do Box-to-box; o 3-2 do Distribuidor com os laterais Invertidos).
Depois disso, a tabela de conflitos do assistente (escalar) e "melhor função" no mercado (memória funcao-automatica).
Referência: guia de sinergias do FM26 (upload do dono, footballmanagerblog 2026/03), 14 combinações mapeadas na memória funcao-automatica.

Modelo: Opus (calibragem do motor, decisões de mecânica). Sem subagentes: as rodadas de mexer e medir dependem uma da outra.

## Ferramentas (scratchpad da sessão 7777bdae; recriar se sumirem)

- `combos.mjs [jogos] [variantes]`: 4-3-3 com pontas, grade, papéis nos dois lados do time A, B no padrão; pts/j, GP, GC, xG. 2000 jogos ≈ 2 min por variante.
- `diag.mjs [jogos] '{"nome":{"DR":"apoiador",...}}'`: pelo registro do motor, ataques que chegam à faixa 4/5, perdas por faixa, passos por tipo,
  quanto o jogador do papel participa e onde. `F="4-2-3-1"` troca a formação.
- Ruído: ±0,04 pt/j com 2000 jogos.

## Medido (pts/j, padrão 1,32)

invertido 1,40 · mezzala 1,26 · apoiador 1,14 (GP 0,87, GC 1,13) · lateral invertido 1,37 (GC 0,92) · box-to-box 1,27 · distribuidor 1,31
inv+mezz 1,35 (= soma) · inv+apoi 1,29 (+0,07) · mezz+apoi 1,17 (+0,09) · trio 1,29 (+0,13) · box+latinv 1,31 (= soma) · distrib+latinv 1,35 (= soma) · mezz+latinv 1,30

## Diagnóstico até aqui

- Na grade, quem tem 22 atributos joga com os 3 da T1 (comNovos, motor.js:511): o teste já vale para a T1.
- Apoiador (diag, 600 jogos): participa de ~100 passos/jogo, 70 deles nas faixas 1–2; na faixa 4–5 só 8 (Fixo 5). Ataques que chegam à faixa 4
  caem de 47,6% para 45,6%; sofre mais (xG 0,97 → 1,07) pela transição (CONFIG.papeis.transicao = 1 × (com − sem)).
  A presença pelo lado nas faixas 4–5 quase não vira chance: investigar o valor da zona 4D/5D, o cruzamento e quem recebe ali.
- Passagem do Apoiador (motor.js ~528): olhava só a POSIÇÃO do ponta (RW/MR = aberto). Corrigido no código local (não publicado), só na grade:
  com Ponta invertido, Condutor ou Articulador na frente, o Apoiador passa por fora (PONTA_POR_DENTRO). Medido: inv+apoi 1,29 → 1,26, trio 1,29 → 1,24
  (ruído). Fiel ao futebol real; manter, mas o ganho de largura precisa vir do passo 1.

## Faltas na grade (adicionado 07/11, pedido do dono)

O ajuste de 05/11 (a36aa15: falta do atacante, falta na perda / contrapressão, falta tática no contra-ataque, amarelo 0,8) só vale na T0:
CONFIG.t1 desliga as três. Nos amistosos (grade) o time sem a bola ainda faz quase todas as faltas (print do dono 07/11: Trem 1 x 0 Candal,
xG 1,34 x 0,14, Candal 7 amarelos e 1 vermelho, Trem 2). Ligar as três na grade e recalibrar: na T0 elas empataram a precisão do passe no
espaço pela Movimentação (0,739 x 0,739 em 600 jogos) e quebraram o teste_mecanicas 8; resolver isso em vez de desligar.
Medir com `node ferramentas/sim_faltas_posse.mjs [n] t1`. Metas: ~22 faltas/jogo, inclinação faltas × posse perto de zero
(real -0,05 a +0,05 por time na temporada), ~4–5 cartões/jogo.
Liga medida 07/11 (SQL, por time e jogo): antes do ajuste 234 jogos, 22,3 faltas, inclinação -0,255, r -0,31, com 60%+ de posse 6,6 feitas x 14,7 sofridas,
10 casos 3×; depois (44 jogos, rodada v112+) 24,2 faltas, -0,137, r -0,16, 7,7 x 12,3, 1 caso 3×. Melhorou metade; refazer com mais jogos.

## Feito em 07/11

- A. Faltas na grade: as três faltas da T0 ligadas na T1 + regra nova faltaDomina (aprovada pelo dono 07/11, só na T1): a falta do defensor no duelo
  × (posse esperada do time que defende / 0,5)^1,2, e falta 0,165 na T1. Só os pesos não bastavam: a falta segue os ataques do rival e o time forte perde
  menos duelos (as faltas na perda também caem com a posse; testado também falta por faixa e falta de ataque na corrida, sem efeito). 1140 jogos t1:
  faltas 30,0 → 21,7, inclinação -0,251 → -0,006, amarelos 6,6 → 4,65, vermelhos 0,49 → 0,21, gols 2,65 → 2,73, contra-ataques 1,96 → 1,35
  (conferir os gols de contra-ataque na auditoria D). teste_mecanicas 8: acerto no espaço comparado na mesma zona (o bruto empatava pela mistura
  de zonas: na mesma zona 0,664 × 0,760); 19 com 400 jogos (ruído). Hash da T1 sem grade atualizado; T0 intacta.
- B. Cobertura: implementada (o papel a mais numa zona cobre o buraco vizinho de outro papel na transição) e medida com 0, 0,5 e 1 em 2000 jogos:
  nada fora do ruído. O motivo: o Box-to-box e o Distribuidor sozinhos não sofrem mais (GC 0,99 e 1,02, padrão 1,02; xG sofrido 0,95 e 1,00, padrão
  0,97), então não há buraco a cobrir; o Box-to-box perde no ataque (GP 0,96, chances 7,2 × 7,8). Retirada (fica só se medido). A sinergia
  box+latinv tem que vir do passo 2 (ataque do Box-to-box) no E.
- C. Passagem do Apoiador pela função do ponta: no código desde 06/11.

## Ordem (dono 07/11: "seguir para o passo 4 com sinergias e as faltas junto")

O passo 4 da revisão das mecânicas (memória revisar-mecanicas) é a auditoria completa uma vez (sim_auditoria, ~2h40 com 4 processos) e depois
o ajuste fino. Mecânica entra ANTES da auditoria; calibragem de pesos DEPOIS:
- A. Faltas na grade (acima).
- B. Cobertura entre papéis (passo 3 abaixo).
- C. Passagem do Apoiador pela função do ponta (já no código local).
- D. Auditoria completa (sim_auditoria) + régua de 300 jogos.
- E. Ajuste fino: passos 1, 2 e 4 abaixo (Apoiador, Mezzala, Box-to-box, tabela inteira de pares), metas das réguas.
Atenção: o Claude Code já matou processos longos por falta de memória (03/11 e 06/11); rodar a auditoria com 2 processos se a máquina estiver apertada.

## Passos

1. Apoiador: achar por que a faixa 4–5 pelo lado não rende (diag por zona: duelos, cruzamentos, xG por cruzamento, quem finaliza) e calibrar
   (mancha, peso da transição dele, valor do cruzamento). Meta: GP acima do padrão, GC acima também, pts/j a ±0,04 do padrão.
2. Mezzala e Box-to-box: o mesmo diagnóstico (chegada à área, finalização de quem vem de trás, custo sem a bola). Meta igual.
3. Cobertura (mecânica nova, aprovada pelo dono 06/11): quem tem mapa sem a bola perto do buraco deixado por um papel que sobe cobre
   a transição dele (reduz o termo transicao). Pares do guia: lateral Invertido ↔ Box-to-box do mesmo lado; Distribuidor + laterais Invertidos (3-2).
   Meta: box+latinv e distrib+latinv acima da soma (sinergia > +0,05), sem tirar o padrão do lugar.
4. Repetir a tabela inteira (todas as variantes do combos.mjs + 4-2-3-1 e 3-5-2 para os pares de volantes e atacantes, itens 6, 7, 9–14 do guia).
5. Trava: teste_t0_intacta (a liga T0 não pode mudar), suíte completa sem --rapido (motor), relatório com os pesos mudados (regra pesos livres).
   Publicar: empacotar, publicar.py, commit; o dono cola a rodada.

## B e C revistos (07/11, depois)

- B (dono aprovou 07/11 "meio ocupado na posse" se o Box-to-box perdesse posse): diag de 1000 jogos mostrou que ele perde na qualidade da chance, não
  na posse (ataques 37,7 × 38,2; com chute 17,7% × 19,0%; xG/ataque 0,024 × 0,026; perdas na f3 8,0 × 7,5). Não implementado; vai para o E (passo 2).
- C medido de novo (2000 jogos, com as faltas novas): passagem pela função do ponta × pela posição: inv+apoi 1,21 × 1,30 (xG a favor 0,97 × 1,03,
  contra 1,10 × 1,06), trio 1,30 × 1,25. Fica no código (fiel ao futebol real); o custo é a presença do Apoiador no 4D/5D que não vira chance: passo 1 do E.
