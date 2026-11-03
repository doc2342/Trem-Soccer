# Saúde do motor

Gerado por `ferramentas/relatorio_motor.mjs`. Não editar à mão.

**Atributos:** 0 não lidos · 1 sem efeito demonstrado · 16 com efeito não revalidado · 8 validados na integração.

## Mecânicas

| Mecânica | Dependências diretas | Regressão |
|---|---|---|
| Lançamento | duelo aéreo, segunda bola, reposição | mecanicas 1; cruzada |
| Agressividade | duelo, falta, cartão, pressão, terceiro homem | mecanicas 2; cruzada |
| Pressão | foto do lance, escolha do passo, Decisões | mecanicas 3; cruzada |
| Entrelinhas | passe no espaço, escolha do passo, Movimentação | mecanicas 4; cruzada |
| Comunicação | basculação, virada, buraco, chance | mecanicas 5; teste_grade; cruzada |
| Força do goleiro | cruzamento, segunda bola, rebote, escanteio | mecanicas 6; rebote_gol_contra; cruzada |

## Commits

- 9d87ec9 Revisão de mecânicas 1: lançamento pelo alto invertido. Quem lança bem põe a bola limpa 
- ed30b3a Revisão de mecânicas 2: Agressividade no duelo apertado. Com a folga perto de zero, ganh
- de9e7ae Revisão de mecânicas 3: a pressão rende pelos atributos de quem pressiona (Velocidade, R
- 0e82aef Revisão de mecânicas 4: passe entrelinhas também com a zona ocupada: outro aparece ao la
- 4c70184 Revisão de mecânicas 5: Comunicação na organização defensiva. A rapidez da basculação pa
- 30257b5 Revisão de mecânicas 6: Força do goleiro no contato. Pesa na disputa do cruzamento alto,

## Atributos

| Atributo | Classe | Evidência | Lido em |
|---|---|---|---|
| Reflexos | 4 | auditoria de 02/11, até 0.189 gols; não revalidado depois das mecânicas | motor.js:750, motor.js:767, motor.js:771, motor.js:782, motor.js:785 e mais 2 |
| Um contra um | 4 | auditoria de 02/11, até 0.060 gols; não revalidado depois das mecânicas | motor.js:737, motor.js:776, motor.js:1238, motor.js:1305, motor.js:1837 |
| Encaixe | 4 | auditoria de 02/11, até 0.038 gols; não revalidado depois das mecânicas | motor.js:737, motor.js:756, motor.js:1260, motor.js:1292 |
| Comunicação | 5 | basculação por faixa, troca de corredor, buraco | motor.js:525, motor.js:544, motor.js:659 |
| Posicionamento | 4 | auditoria de 02/11, até 0.155 gols; não revalidado depois das mecânicas | motor.js:387, motor.js:390, motor.js:396, motor.js:647, motor.js:656 e mais 16 |
| Desarme | 4 | auditoria de 02/11, até 0.080 gols; não revalidado depois das mecânicas | motor.js:398, motor.js:399, motor.js:402, motor.js:403, motor.js:1055 e mais 1 |
| Marcação | 4 | auditoria de 02/11, até 0.151 gols; não revalidado depois das mecânicas | motor.js:398, motor.js:399, motor.js:402, motor.js:403, motor.js:749 e mais 7 |
| Cabeceio | 4 | auditoria de 02/11, até 0.038 gols; não revalidado depois das mecânicas | motor.js:691, motor.js:752, motor.js:755, motor.js:756, motor.js:1279 e mais 6 |
| Cruzamento | 2 | auditoria de 02/11, até 0.020 gols | motor.js:392, motor.js:740, motor.js:749, motor.js:755, motor.js:766 e mais 5 |
| Criatividade | 4 | auditoria de 02/11, até 0.140 gols; não revalidado depois das mecânicas | motor.js:385, motor.js:386, motor.js:391, motor.js:392, motor.js:775 e mais 1 |
| Passe | 4 | auditoria de 02/11, até 0.128 gols; não revalidado depois das mecânicas | motor.js:385, motor.js:386, motor.js:387, motor.js:390, motor.js:391 e mais 4 |
| Domínio | 4 | auditoria de 02/11, até 0.194 gols; não revalidado depois das mecânicas | motor.js:385, motor.js:386, motor.js:387, motor.js:390, motor.js:391 e mais 16 |
| Chute de longe | 4 | auditoria de 02/11, até 0.059 gols; não revalidado depois das mecânicas | motor.js:385, motor.js:709, motor.js:712, motor.js:713, motor.js:717 e mais 7 |
| Finalização | 4 | auditoria de 02/11, até 0.164 gols; não revalidado depois das mecânicas | motor.js:693, motor.js:709, motor.js:713, motor.js:746, motor.js:749 e mais 18 |
| Drible | 4 | auditoria de 02/11, até 0.141 gols; não revalidado depois das mecânicas | motor.js:385, motor.js:386, motor.js:391, motor.js:392, motor.js:749 e mais 6 |
| Velocidade | 5 | pressão | motor.js:386, motor.js:387, motor.js:391, motor.js:392, motor.js:398 e mais 20 |
| Força | 5 | goleiro no contato; duelo aéreo | motor.js:691, motor.js:732, motor.js:735, motor.js:737, motor.js:752 e mais 8 |
| Resistência | 5 | pressão | motor.js:399, motor.js:401, motor.js:402, motor.js:1465, motor.js:1761 |
| Trabalho em equipe | 5 | pressão | motor.js:391, motor.js:401, motor.js:402, motor.js:456, motor.js:656 e mais 1 |
| Agressividade | 5 | duelo apertado, pressão e falta | motor.js:401, motor.js:1165, motor.js:1169, motor.js:1398, motor.js:1465 |
| Influência | 4 | auditoria de 02/11, até 0.035 gols; não revalidado depois das mecânicas | motor.js:448, motor.js:456, motor.js:457 |
| Excentricidade | 4 | auditoria de 02/11, até 0.097 gols; não revalidado depois das mecânicas | motor.js:832, motor.js:840, motor.js:849, motor.js:1190, motor.js:1487 e mais 3 |
| Passe longo | 5 | lançamento: parcela pelo alto cai com o Passe longo | motor.js:1555, motor.js:1576, motor.js:1598, motor.js:1613 |
| Movimentação | 5 | entrelinhas: acerto sobe com a Movimentação | motor.js:735, motor.js:1218, motor.js:1442, motor.js:1450, motor.js:1625 e mais 4 |
| Decisões | 4 | auditoria de 02/11, até 0.092 gols; não revalidado depois das mecânicas | motor.js:396, motor.js:1238, grade.js:70 |

## Validação cruzada

| Par | Medida | Resultado (300 jogos, mesmas sementes) |
|---|---|---|
| Agressividade × pressão | xG sofrido; faltas | base: 2.079; 17.23; agr 45: 1.823; 21.44; pressão 2: 1.743; 13.28; os dois: 1.478; 16.74 |
| Pressão × Comunicação | xG sofrido; viradas por jogo | base: 2.079; 12.04; pressão 2: 1.743; 8.04; com 45: 1.983; 9.60; os dois: 1.702; 6.33 |
| Comunicação × organização | xG sofrido; acerto do rival | base: 2.079; 0.915; com 45: 1.983; 0.915; pos 45: 1.641; 0.916; os dois: 1.648; 0.916 |
| Entrelinhas × pressão adversária | entrelinhas por jogo; acerto | base: 6.31; 0.915; pressão 2: 5.51; 0.863; mov 45: 6.44; 0.922; os dois: 5.63; 0.875 |
| Lançamento × disputa aérea | duelo aéreo ganho (passe longo) | base: 0.429; plo 45: 0.440; força 45 na frente: 0.496; os dois: 0.463 |
| Força do goleiro × disputa física | segura na saída (atacante forte ao lado) | base: 0.492; goleiro 45: 0.800; atacantes 45: 0.331; os dois: 0.784 |

## Histórico do hook

| Rodada | HEAD | Aprovados | Reprovados |
|---|---|---|---|
| 2026-11-03T00-14 | ed30b3a | 84/84 | — |
| 2026-11-03T00-33 | de9e7ae | 84/84 | — |
| 2026-11-03T01-05 | 0e82aef | 84/84 | — |
| 2026-11-03T01-20 | 4c70184 | 84/84 | — |

## Regressões e pontos em aberto

- Pressão 2 reduz as faltas do time que pressiona (17,2 para 13,3 por jogo): contraintuitivo, sem defeito comprovado; olhar no ajuste fino.
- Cruzamento na classe 2 é do 4-2-3-1 da auditoria: nas formações com pontas ou meias de lado ele vale (+0,057 e +0,082 gols); o volume de cruzamentos é da etapa Atacantes.
- Comunicação não soma ao Posicionamento no xG sofrido (Posicionamento 45: 1,641; os dois: 1,648).
- Comunicação no buraco tem efeito pequeno: buraco de 1,26 para 1,12, cruzamentos de 378 para 374.
- Cobertura pela qualidade de quem cobre não chega ao jogo: o empréstimo é limitado pela falta da zona (Comunicação retirada desse caminho).
- Bola no chão: o lateral às vezes lança para a própria faixa 3 (5,6% dos lançamentos rasteiros); narrado como "segue com a bola".
- 4-4-2 espelho: 3,26 gols, 2,77 sem entrelinhas, 1,85 no 4-2-3-1: causa não achada; investigação posterior, sem calibrar agora.
- A falha do commit da mecânica 3 não voltou e seu log se perdeu: a causa não foi confirmada. A trava de custo em blocos dava falso alarme sob carga, e foi corrigida.
