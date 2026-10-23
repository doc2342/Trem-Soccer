# Reinício da liga: escala de notas, treino e economia

Data: 2026-10-23 · Estado: design para aprovação · Anotações do brainstorm: `2026-10-23-reinicio-anotacoes.md`

## Por quê

A liga reinicia no fim da T14. A pirâmide mudou para Série A (12) e Série B em três grupos de 8 (B, C, F), sem Série C, mas os números do jogo (alvos de força, tetos, prêmios, treino, safra) ainda são os de três divisões. O pessoal sente três coisas:

- **Elenco curto:** na A, os 11 titulares estão em ~40, os reservas 12–16 em ~35,5 e os 17–22 em ~31. Quem entra por lesão ou cartão é ~5 pontos pior. A curva de salário (12% por ponto) faz valer a pena pôr todo o teto nos 11.
- **Treino travado no jovem:** o freio por idade espera 13% do caminho aos 16 anos; a base gera garotos acima disso (média 22 de nota aos 16), então todos ficam no piso de 30% até os 18. Print do grupo: um garoto de 16 precisando de 25–38 rodadas por ponto de atributo.
- **Sul-americanos fortes demais:** 2 vitórias em 10 jogos continentais (o xG somado foi 17,1 a 15,1 para os brasileiros: muito é amostra pequena, mas a escala nova deve deixá-los um pouco abaixo da A).

Também achado na análise: a B treina 36% menos que a A (o treino é por jogo de liga: 14 rodadas contra 22), o caixa acumula sem destino (bots da B com 34,7 mi em média, o dobro do teto deles), e há restos da Série C no código.

O reinício é a única hora de recalibrar tudo junto sem atrapalhar uma temporada em andamento.

## Objetivos (alvos da liga madura, a partir da ~T5 depois do reinício)

| Medida | Alvo |
|---|---|
| Onze mediano da Série A | 37–38 |
| Onze mediano dos clubes de fora (ARG, URU, COL, CHI) | 36–37 |
| Onze mediano da Série B | 33–34 |
| Nota máxima | 43 (até 45 com a folga do treino que já existe); craques raros |
| Elenco de dono na A | ~22 adultos, com os reservas 12–16 a 2–3 pontos dos titulares; juvenis complementam |
| Jogador de talento comum | vira reserva da A por volta dos 21 anos |
| Talento alto | titular da A entre 18 e 20 |
| Subida da B para a A | quem sobe sem estrutura sofre (fundo da tabela); quem se estruturou na B (CT, base, treinadores) briga do meio para cima |
| Dinheiro | serve para estruturar e reforçar o elenco, sempre com destino (sem caixa acumulando indefinidamente); a força do rico é limitada pelo teto, não pelo caixa |

## Não objetivos

- Recalibrar o motor da partida: gols, cartões e lesões estão bons e a escala (máximo 43) fica.
- Travas de fluxo do mercado (4 compras pela multa, protegidos, primeira temporada, 5 jogos, perdas por clube, um negócio por par de clubes, volta após duas janelas).
- Metas da diretoria (já são relativas à força dos outros clubes).

## Anti-objetivos (falhou mesmo que "funcione")

- Um clube rico juntar os bons jogadores da liga só por ter caixa.
- A base virar fábrica: juvenil pronto para titular da A aos 17 de forma comum.
- A B ficar presa: clube de dono estruturado na B sem chance de competir ao subir.
- Mexer no motor e perder o equilíbrio de cartões e lesões que o pessoal aprovou.

## Restrições

- Determinismo: o treino roda no servidor (função `rodada`) e nas telas (previsão); nada de `Math.random()` em caminho de motor/treino.
- Módulos de `src/` usados no servidor são empacotados por `ferramentas/empacotar_funcao.py`; mudanças exigem reempacotar e republicar `rodada` e `mercado`.
- Valores que vivem no banco (`divisoes`: teto, TV, patrocínio, ingresso, torcida; `teto_do_clube`; `criar_divisoes`) mudam por migração SQL numerada e idempotente, com teste em PGlite.
- Constantes que existem nos dois lados (JS e SQL, ou JS e empacotador, ex.: teto dos países em `REGUA_DE_FORA`, `botsDaLiga`, `teto_do_clube`) precisam mudar juntas.
- Prazo: tudo pronto antes da virada da T14.

## Decisões já tomadas (com o dono do projeto)

1. **Escala:** máximo continua 43; alvos acima. Os clubes de fora ficam um pouco abaixo da mediana da A.
2. **Treino:**
   - sai o freio por idade (`CONFIG_TREINO.freio`); fica o ritmo por idade (`ritmoDaIdade`) e o talento manda na velocidade (o "caminho" proporcional ao teto pode ficar, se a calibragem pedir);
   - o treino passa a ser medido **por temporada**: a soma de uma temporada é a mesma na A (22 rodadas) e na B (14), por exemplo escalando os pontos da sessão pelo número de rodadas de liga do grupo.
3. **Juvenil** só joga no profissional com contrato assinado (como hoje); sem custo antes disso. O controle de "não ficar pronto cedo demais" vem da calibragem do treino e da nota de chegada da base, não de cobrar o juvenil.
4. **Salário:** curva mais inclinada que os 12% por ponto de hoje (faixa esperada 13–15%), ancorada no craque (nota ~41 custa o mesmo de hoje, ~1,5 mi). Medido nos elencos atuais: com 15%, cabem de 7 a 12 jogadores a mais no teto; craque ÷ salário mediano passa de 1,8× para 2×, craque ÷ mais barato de 6,8× para 9×.
5. **Travas que mexem com dinheiro** acompanham a curva: máximo individual (15% do teto), multa (5× o salário), contrato dentro do teto. Conferir valores, não redesenhar.
6. **Abordagem:** calibrar por simulação da liga inteira (ver Abordagens).

## Abordagens consideradas

| | Como | Troca | Escolha |
|---|---|---|---|
| **A** | Simulador de liga completa (pirâmide nova + países, ~10 temporadas, treino + base + safra + salários + tetos + receitas + caixa + mercado simplificado de dono), ajustando parâmetros até bater os alvos | Mais trabalho; único que pega interações (juvenil sem freio × caixa sobrando × curva nova) | **Escolhida** |
| B | Cada parte com conta ou sim pequena separada | Mais rápido; partes só se encontram depois do reinício | Usada como etapa dentro de A |
| C | Ajuste mínimo agora, corrigir temporada a temporada | Mais barato; desperdiça o reinício e ajustes no meio do caminho incomodam | Descartada |

Ordem de trabalho dentro de A: (1) treino e base sozinhos (curva de evolução por idade e talento bate os alvos de 21 / 18–20); (2) liga inteira com economia; (3) geração da liga nova.

## O que construir

### 1. Simulador da liga madura (ferramenta, `ferramentas/sim_liga.mjs` ou extensão de `sim_escada.mjs`)
- Pirâmide nova: A de 12 com turno e returno (22 rodadas), B em 3 grupos de 8 (14 rodadas), playoff/acesso/descenso como o jogo faz (`DESCENSO_DA_PRIMEIRA = 3`, `vencedorDoPlayoff`), 4 países com a régua de fora.
- Clubes de dono modelados de forma simples: investem em CT/base/estádio até o teto da estrutura, mantêm ~22 adultos dentro do teto de folha, profissionalizam juvenis quando valem, renovam pelo mercado; bots como o jogo faz (`virada.js`, `mercadobots`).
- Usa os módulos reais de `src/` (treino, base, virada, economia, gerador) com parâmetros sobrescrevíveis pela linha de comando, como os `sim_*` atuais (`CONFIG.chave=valor`).
- Saída por temporada: onze mediano por série, notas dos reservas 12–16 e 17–22, tamanho de elenco, idade em que jovens comuns/altos chegam a 35 e 38, quantos ≥42, folha/teto, caixa mediano e máximo por série, distância do 1º para o 2º.
- Resultado da partida: pode ser pela força do onze com ruído (como `sim_escada`) em vez do motor completo, desde que calibrado contra o motor (a tabela entre bots é "metade sorte").

### 2. Treino
- Remover o freio; tratar o treino por temporada (A e B iguais); recalibrar `pontosPorSessao`/`caminho`/`ritmoDaIdade` se preciso para os alvos de idade.
- A tela de previsão ("sobe em cerca de N rodadas") continua coerente com a regra nova.

### 3. Base e safra
- Nota de chegada da base (`CONFIG_BASE.nota`) e talentos por divisão (`TALENTO_DO_JOVEM_POR_DIVISAO`, `NOTA_DO_JOVEM_POR_DIVISAO`) só para A e B.
- Safra de raros (`CONFIG_SAFRA`): quantidade por temporada para os craques continuarem raros na escala nova.

### 4. Economia
- Curva de salário (`salarioDeMercado`) com o novo fator; comentários com a tabela de exemplo atualizados.
- Tetos (`TETO_DE_FOLHA`, `divisoes.teto_folha`, `teto_do_clube`, `REGUA_DE_FORA.teto`, `botsDaLiga`) para A, B e países.
- Receitas (TV, patrocínio, ingresso, torcida base, `PREMIOS`, `PREMIO_MINIMO`) para que o saldo de um clube médio feche e o caixa tenha destino.
- Destino do dinheiro: o simulador mede o caixa; se ele acumula, o design da correção (receita menor, manutenção maior, novo gasto) volta ao dono do projeto antes de ser feito.
- `ctSemDono` dos bots só com A e B.

### 5. Limpeza da Série C
- Remover/neutralizar a divisão 3 onde não é mais usada (tetos, prêmios, jovem, `criar_divisoes`), sem quebrar o histórico (temporadas antigas têm divisão 3 e grupos D/E).
- `ferramentas/saude.mjs`: grupo F é da Série B, não país (`"ABCDE".includes` → usar `GRUPOS_DA_B`/`divisaoDoGrupo`).

### 6. Liga nova (reinício)
- **Decidido:** é a virada para a T15, mas com todos os estados voltando ao inicial, com as regras atuais. Dos clubes ativos (com dono) só sobrevivem **nome e escudo**: elenco, caixa, estádio, CT, base, treinadores, torcida, juvenis e o resto recomeçam do estado inicial. Bots são resetados por inteiro.
- **Decidido:** a liga começa abaixo dos alvos e **cresce organicamente** até eles (bots inclusive), pelo treino, base e safra; os alvos da tabela de Objetivos são da liga madura.
- O fluxo atual "Reiniciar o teste" (`reiniciar_teste`, que volta a um estado guardado e monta a pirâmide antiga com D/E) não serve como está: é preciso um reinício que gere elencos novos com `gerarElenco` na pirâmide nova (A 12, B em 3×8, países), mantendo nome e escudo dos clubes com dono.
- **Decidido:** o botão de reinício é reescrito. A primeira temporada depois dele é a **temporada 0**, que serve para medir o nível dos clubes: **todos os clubes com dono começam na Série B** (hoje 18 donos para as 12 vagas da A).
- **Decidido:** na temporada 0 a Série A tem 12 bots; os donos jogam a B, **6 donos e 2 bots em cada grupo** (3 × 8). Na virada da T0 para a T1 **sobem 12 donos** e a A volta a ser só de donos; os bots da A descem para a B.
- **Decidido:** o critério é o **playoff**. O playoff de cada grupo já põe 4 clubes na semifinal (1º e 2º direto, mais os 2 vencedores da preliminar 3×6 e 4×5): **sobem os 4 semifinalistas de cada grupo**, 4 × 3 = 12. A final continua valendo o título do grupo.
  - Minha proposta para as sobras: bot ou dono inativo (`ativo` da virada) entre os semifinalistas não ocupa vaga; ela vai para o dono ativo do mesmo grupo eliminado na preliminar com melhor campanha, e, se o grupo não tiver, para o melhor dono ativo restante dos outros grupos (posição, depois pontos).
  - Distribuição dos donos nos grupos (minha proposta): sorteio, porque os elencos recomeçam iguais e não há força para serpentina.
- **Decidido:** a virada é no **domingo, 25/10/2026**, com tudo pronto (calibragem completa inclusive). Se não fechar a tempo, o dono do projeto adia a virada; não há entrega em fases.
- O simulador parte desse mesmo estado inicial e mede em quantas temporadas a liga chega aos alvos (proposta minha: em torno de 4 a 5 temporadas; o nível inicial dos elencos é o botão para isso).

## Entregas e verificação
- Relatório do simulador mostrando os alvos atingidos (ou o mais perto possível, com o porquê). **Ponto de parada:** o dono do projeto aprova esses números antes de eles irem para o jogo.
- Prazo: domingo 25/10. Ordem para não travar: reinício novo e limpeza da C em paralelo com o simulador; calibragem; aprovação; aplicar os valores.
- Migração SQL nova (próximo número livre) com os valores das divisões, idempotente e com teste PGlite.
- Testes `node:assert` para a regra nova do treino (sem freio; A e B somam o mesmo por temporada) e para a curva de salário.
- `node ferramentas/testes.mjs` passando; funções reempacotadas; `publicar.py` antes do commit que vai ao ar.

## Deixado para quem constrói
- Valores exatos de todos os parâmetros (saem da simulação).
- Como modelar o dono no simulador, desde que o comportamento seja o de um dirigente ativo razoável.
- Se o treino por temporada é feito escalando a sessão ou mudando o número de sessões.
- Nome e estrutura do simulador.
