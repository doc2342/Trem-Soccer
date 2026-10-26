# Técnico do ano geral (dos dirigentes)

## Por quê
O Técnico do ano de cada série só olha a liga (quem mais superou a colocação esperada pela força do elenco). Falta um prêmio que
pese a temporada inteira — liga, Copa do Brasil, Libertadores, Sul-Americana, Supercopa e Recopa —, como no futebol real, em que
o campeão da Libertadores e do Brasileirão é o técnico do ano mesmo que outro tenha feito mais com menos na liga.

## O que é
- Um prêmio a mais por temporada, **só entre clubes com dirigente** (bots fora). Só de honra (valor 0), como o da série.
- O da série continua igual.
- Soma de pontos por competição. Ganha quem tiver mais pontos; empate: quem mais superou a colocação esperada na série
  (o mesmo `numero` de `tecnicosDoAno`), depois a melhor posição.
- Dirigente que trocou de clube no meio da temporada: conta a campanha do clube onde ele terminou (o prêmio é do clube, com o
  nome do dirigente da hora, como o da série).
- Nenhum dirigente com ponto: sem prêmio geral na temporada.

## Pesos (decididos na conversa; ajustáveis numa tabela no topo da função)
| Competição | Campeão | Vice | Semi | Quartas |
|---|---|---|---|---|
| Libertadores | 11 | 7 | 4 | 2 |
| Copa do Brasil | 6 | 4 | 2 | 1 |
| Sul-Americana | 5 | 3 | 2 | 1 |
| Supercopa / Recopa | 1 | – | – | – |

Liga, pela posição na fase de liga:
- Série A (12 clubes): 10, 8, 7, 6, 5, 4, 3, 3, 2, 1, 0, 0.
- Série B (cada grupo vale o mesmo): campeão = quem vence o playoff e sobe (regra da T14, `campeaoDaSerie`) = 6; vice do playoff 4;
  semifinal do playoff 3. Quem não for longe no playoff fica com o da posição na liga: 1º 4, 2º 3, 3º 2, 4º a 6º 1. Vale o maior dos dois.
- Outras divisões e grupos de outros países: 0 (não há dirigente lá).

Casos que a tabela precisa respeitar (viram asserts no teste):
- Série A + Copa do Brasil (16) > Libertadores + meio de tabela (11 + 4 = 15).
- Libertadores + Série A (21) ganha de todos.
- Campeão da Libertadores (11) > campeão da Série A (10).
- Campeão da B + Copa do Brasil (12) > qualquer título sozinho, exceto a Libertadores somada a alguma posição na A.

## Abordagens
1. **Escolhida:** função JS `tecnicoGeral` em `src/rodada.js`, ao lado de `tecnicosDoAno`, com os pesos numa constante. O resultado
   entra na mesma lista que já vai para `premiar_tecnicos` / `fechar_temporada` (`p_tecnicos`), como mais uma linha com um grupo
   próprio (ex.: "GERAL"). Usada nos dois caminhos do fechamento: `admin.html` (virada manual) e `fecharTemporadas` no template de
   `ferramentas/empacotar_funcao.py` (servidor). Pesos fáceis de mexer, testável com node, sem SQL novo.
2. Calcular no banco dentro de `fechar_temporada`: pesos no SQL, cada ajuste vira migração; descartada.

## Restrições
- O fechamento no servidor hoje só lê partidas de liga e playoff (`fase is null` ou `liga, pre, semi, final`); precisa ler também
  copa e "lib" (com `copa_fase`, `grupo` e `vencedor`). Copa: `fase "copa"`, `copa_fase` 0 = Supercopa, 1–6 (6 = final).
  Continentais: `fase "lib"`, grupo LIB / SUL / REC, `copa_fase` 3–6 (REC é jogo único, 6).
- Depois: re-empacotar (`empacotar_funcao.py`), republicar a função rodada, `publicar.py`.
- Primeira temporada do reinício: a Série A começa sem dirigente, então na prática o prêmio sai da B + Copa do Brasil.

## Para o construtor decidir
- Nome do grupo gravado ("GERAL" ou outro) — conferir se `premiar_tecnicos` / a tabela de prêmios aceitam um grupo que não é
  de clube, e mostrar o prêmio em `jogo.html` (Prêmios da temporada / quadro de honra) com o nome "Técnico do ano" sem série.
- O `numero` gravado para o geral: os pontos (o rótulo "posições" do da série não serve; mostrar "pts").
