# Troca de arquitetura e cidade só na ampliação do estádio

Decidido com o dono em 26/10/2026. Detalha a linha do estádio em `2026-10-23-reinicio-anotacoes.md`. Entra junto com o reinício da liga.

## Por quê
Hoje dá para trocar o modelo do estádio a qualquer hora, numa reforma avulsa de 25% (116), e a cidade uma vez, de graça (119). Além disso, há trocas grátis espalhadas: para o dono novo (120) e para cada estádio novo (127). Depois do reinício, o estádio passa a ser uma escolha de quem monta o clube. Mudar de ideia custa caro e só acontece junto com uma obra de verdade.

## Regras
- **Ampliar sem mudar nada:** custo e prazo normais (`custo_da_obra('estadio', n)`, `prazo_da_obra(n)`).
- **Ampliar mudando a arquitetura, a cidade ou as duas:** o custo da ampliação +50%, numa taxa só que cobre as duas trocas. O prazo é o da ampliação, e a mudança vale quando a obra termina. Escolher o modelo ou a cidade que já tem não conta como mudança.
- **Primeira ampliação (do nível 1 para o 2):** escolha livre, sem os +50%. A regra é só "nível alvo = 2", sem marca nenhuma. Ela cobre o reinício, porque todos voltam ao nível 1, e o dirigente novo, porque `123` já zera o estádio e o visual.
- **No nível 8, onde não há mais ampliação:** a troca é uma obra de 15 mi (50% do nível 8) com prazo de 18 rodadas (metade do nível 8). Ela ocupa a fila de uma obra por vez.
- **Continuam grátis e na hora:** nome, mosaico, padrão, cores, cor das escadas e cobertura (`salvar_estadio_visual`).
- **Estádio novo lançado depois:** continua como no 127. O administrador roda `liberar_troca_gratis('<modelo>')` e cada clube com dirigente ganha uma troca grátis e na hora, só para esse modelo e em qualquer nível. Essa é a única troca grátis que fica.
- **Somem as outras trocas grátis:** `reforma_gratis` (geral), `cidade_trocada` e a troca de cidade em `salvar_estadio_visual`.

Custos extras: 750 mil no nível 2, 15 mi no nível 8.

## Abordagens
- **A (escolhida): a escolha fica no visual do estádio.** A obra grava `estadio_visual.modelo_alvo` e `cidade_alvo`, e o gatilho de conclusão (116) passa a valer também para a obra `estadio` e aplica os dois. Não precisa de coluna nova nem de republicar a função `rodada`, e segue o padrão que já funciona.
- B: colunas `modelo_alvo`/`cidade_alvo` em `obras`. O histórico fica mais limpo, mas pede migração de tabela, e nada usa esse histórico hoje.
- C: a função `rodada` aplica a troca na entrega da obra. Não traz vantagem sobre o gatilho e obriga a reempacotar e republicar a função.

## O que muda
- Um SQL novo e idempotente:
  - `iniciar_obra` ganha `p_modelo`/`p_cidade` opcionais, só para o estádio. Se houver mudança e o nível alvo for maior que 2, cobra os +50%. Valida o modelo pela lista de `reformar_estadio` (129) e a cidade pelas 5 de `cidade_do_estadio`.
  - `reformar_estadio`: a troca grátis de estádio novo (`reforma_gratis_para`) é gasta primeiro, em qualquer nível. Fora isso, a função só aceita o nível 8: 15 mi, 18 rodadas, com modelo e/ou cidade.
  - O gatilho de conclusão aplica `modelo_alvo` e `cidade_alvo` nas obras `estadio` e `estadio_modelo`.
  - Sai o gatilho do 120. O `liberar_troca_gratis` do 127 fica.
  - Limpa as marcas `reforma_gratis` e `cidade_trocada` dos clubes.
  - A cidade sai de `salvar_estadio_visual`.
- **`src/banco.js`:** `iniciarObra` repassa o modelo e a cidade. O padrão de tolerância vale aqui: se a função antiga não aceitar os parâmetros, cai na chamada sem eles.
- **`jogo.html`, tela do estádio:** a ampliação mostra "manter" ou "mudar" (modelo e cidade), com o "+X" quando houver mudança e "grátis" na primeira ampliação. No nível 8, aparece a troca de 15 mi. Saem os textos de reforma de 25%, de troca grátis geral e de troca única de cidade. Fica o aviso de troca grátis para o estádio novo.
- **Teste SQL** (`ferramentas/teste_*_sql.mjs`, com pglite), cobrindo:
  - a primeira ampliação sem custo extra;
  - a segunda com +50%;
  - a ampliação sem mudança no custo normal;
  - o nível 8 a 15 mi e 18 rodadas;
  - a troca grátis de estádio novo valendo em qualquer nível;
  - o gatilho aplicando modelo e cidade;
  - a migração rodando duas vezes.

## Fora do escopo
- Bônus de estacionamento e refletores.
- Mudar custo ou prazo das ampliações em si.

## Fica com quem implementar
- O visual da escolha na tela, seguindo a identidade do redesign do estádio.
- Se a mesma tela mostra uma prévia do modelo e da cidade escolhidos antes de confirmar. Os desenhos já existem em `src/estadio.js`.
- O texto dos lançamentos no extrato.
