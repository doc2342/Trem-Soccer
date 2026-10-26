# Calibragem do reinício: relatório para aprovação

Data: 2026-10-25 · Plano: `docs/superpowers/plans/2026-10-23-reinicio-escala-treino-economia.md` (Tarefa 4) · Design: `2026-10-23-reinicio-escala-treino-economia-design.md`

**Estado: aprovado em 25/10/2026.** Valem os valores propostos, com o `TALENTO_DA_BASE = −12`. Para o caixa, vale a correção 1 **só para os clubes sem dono**: todo ano o bot paga 30% do caixa acima do teto de folha, e o dinheiro vai para o fundo da liga (a Federação). A Tarefa 8 aplica isso.

Efeito simulado do imposto só dos bots (recomendada, 5 sementes): na T14 o caixa mediano é de 30,8 mi no bot da B, 37,3 mi nos países, 15,7 mi no dono da A e 11,8 mi no dono da B, com o nível igual. O fundo recebe ~86 mi na T1, ~330 mi na T5 e ~450 mi por temporada da T8 em diante: é praticamente toda a sobra dos 58 bots. O fundo continua pagando os prêmios individuais e a copa; o fator da copa já está no máximo (2×, a partir de ~36 mi no fundo, `fator_da_copa` do 58), então o resto fica parado no fundo, fora da economia dos clubes. Se um dia o fundo precisar de outro destino, a decisão é separada.

Há três decisões, explicadas no fim:
1. a regra nova do talento da base;
2. a correção do caixa;
3. aceitar ou não os dois alvos que não fecham (a A madura passa um pouco de 38 sem a regra nova, e a A só chega a 37 na T7).

## Como foi medido

- `ferramentas/sim_liga.mjs` simula a liga inteira a partir do estado do reinício: na T0, a A com 12 bots; B, C e D com 6 donos e 2 bots cada; 4 países de 10 clubes.
- Os módulos são os reais: treino (`treinar`, `fatorDaTemporada`), virada (`planejarVirada`, com a regra da T0, envelhecimento, aposentadoria, base, reposição dos bots, safra, acesso e descenso), gerador e economia.
- Média de 5 sementes. A janela do alvo é a T5–T10, como no plano. A T14 mostra onde a liga se firma.
- **Partida:** força do onze do mandante − a do visitante + 1,0 + normal(0, 5); abaixo de 1,5 é empate. Isso foi ajustado aos 660 jogos de liga da T14 real: a fórmula dá favorito 46%, empate 23% e mandante 45%; o real foi 45,9%, 22,7% e 45,9%.
- **Validação:** com os valores de hoje, o simulador chega à T14 com o onze mediano em 39,5 (A), 36,4 (B) e 39,3 (países). A liga real, depois de 14 temporadas, está em 39,9 / 36,2 / ~38. O simulador reproduz bem a liga de verdade.
- **Simplificações** (marcadas com `ponytail:` no código):
  - dono de regra fixa: obras de CT e base até 4 e estádio até 6, 22 adultos, compra de bot pela multa (até 4 por temporada), venda ao agente de quem ele dispensa;
  - sem negócio entre donos, sem mercado entre bots;
  - o salário só sobe (renovação pelo maior valor);
  - a bilheteria usa a torcida-base, o prestígio e o estádio, mais uma média da copa.

## Achados que mudaram a abordagem

1. **Nas primeiras temporadas, a liga é feita dos elencos gerados no reinício.** O adulto gerado tem talento médio 48 (teto 32,6), e a metade de cima disso dá um onze de ~35,3. Com isso o B fica em ~35,5 qualquer que seja o treino, o nível inicial ou o jovem do bot. A única alavanca que mexe nisso é o talento dos elencos do reinício. Por isso entra uma constante nova no `admin.html`, `TALENTO_DO_REINICIO`, o mesmo tipo de deslocamento do `TALENTO_DO_JOVEM_POR_DIVISAO`.
2. **Depois, a liga é feita dos jovens.** O jovem tem talento médio 58 (mais que o adulto gerado), então tudo sobe devagar até a T14. O patamar maduro de cada série é decidido pelo talento dos seus jovens:
   - bot da B: `TALENTO_DO_JOVEM_POR_DIVISAO`;
   - países: `REGUA_DE_FORA.talento`;
   - donos: o talento da base, que **hoje não tem parâmetro**.
3. **O teto de folha prende a A** (folha/teto chega a 1,00), mas baixar o teto encurta o elenco. Com 17 mi, o dono da A caiu para 17–18 adultos e 20 juvenis, o "elenco curto" que o design quer evitar. Com 19 mi ele mantém 22.

## Alvo × resultado

Configuração **recomendada** (tabela de valores abaixo). Entre parênteses, a versão **sem regra nova**: tudo igual, sem o `TALENTO_DA_BASE`.

| Medida | Alvo | T5–T10 (média) | T10 | T14 | Hoje (sim., T14) | |
|---|---|---|---|---|---|---|
| Onze mediano da Série A | 37–38 | 37,0 (37,5) | 38,3 | 38,3 (39,3) | 39,5 | ✓ (sem a regra nova, passa 1,3 na liga madura) |
| Onze mediano dos países | 36–37 | 36,3 | 36,1 | 36,6 | 39,3 | ✓ |
| Onze mediano da Série B | 33–34 | 33,5 | 33,3 | 33,3 | 36,4 | ✓ |
| Nota máxima / craques raros | 43 (45 com a folga); raros | — | 8 ≥ 42 na A | 9 na A, 26 na liga (34 sem a regra nova) | 82 (17 na A); real hoje: 40 (26 na A) | ✓ |
| Elenco de dono na A | ~22 adultos | 22 | 22 | 22 (+19 juvenis) | 21 | ✓ |
| Reservas 12–16 da A | 2–3 abaixo do onze | 3,7 abaixo | 3,8 | 3,2 (35,1) | 3,8; real hoje 4,5 | quase |
| Comum vira reserva da A (35) | ~21 anos | 20,3 anos (aos 21: 36,2) | | | 19,8 anos | ✓ |
| Talento alto titular da A (37,5–38) | 18–20 anos | 37,5 aos 19,9; 38,0 aos 20 | | | 19,4 anos | ✓ (no limite de cima) |
| Base não vira fábrica | juvenil não fica pronto aos 17 | alto aos 17: 28,9 | | | | ✓ |
| Quem sobe sofre; o estruturado sobe na tabela | fundo, depois o meio | posição média na A: 8,3 na 1ª temporada e 6,8 na 2ª (de 12) | | | 8,0 / 6,5 | ✓ |
| A força do rico vem do teto, não do caixa | folha presa ao teto | folha/teto da A: 0,82 → 1,00 na T10 | | | | ✓ |
| Dinheiro sempre com destino | caixa não acumula | **não**: os bots acumulam (ver Caixa) | | | | ✗ (para decidir) |
| Ritmo até os alvos | ~4–5 temporadas | B e países no alvo desde a T0; a A chega a 37 na **T7** e a 37,5 na T8 | | | | 2 temporadas a mais |

Na A não sobra bot depois da T0, então a A só cresce pelos donos, que partem de ~33 na T1 e ganham ~0,7 por temporada. Testei um nível inicial maior (32 e 33): o B passa do alvo (bots e donos são gerados no mesmo nível) e a A quase não adianta. Para adiantar a A seria preciso um nível próprio para os elencos dos donos no reinício. Não testei isso; fica como opção, se o ritmo importar.

## Valores propostos

| Parâmetro (onde mora) | Hoje | Proposto |
|---|---|---|
| `CONFIG_TREINO.pontosPorSessao` (treino.js) | 150 | **130** (as idades de chegada tinham ~1 ano de folga) |
| `CONFIG_TREINO.caminho`, `ritmoDaIdade`, `ctSemDono` | 26 / curva / {1: 4, 2: 2} | sem mudança |
| `CONFIG_BASE.nota` (base.js) | 15 + 1,5 por nível | sem mudança |
| `NOTA_DO_JOVEM_POR_DIVISAO` (virada.js) | {1: 26, 2: 24} | sem mudança |
| `TALENTO_DO_JOVEM_POR_DIVISAO` (virada.js) | {1: 8, 2: −8} | **{1: 8, 2: −22}** (a chave 1 só vale para os bots da A na T0) |
| `CONFIG_SAFRA` teto 43 (virada.js) | [[0, .4], [1, .45], [2, .15]]: média 0,75 por temporada | **[[0, .8], [1, .2]]: média 0,2** |
| `CONFIG_SAFRA` teto 42 | [[0, .1], [1, .4], [2, .4], [3, .1]]: média 1,5 | **[[0, .5], [1, .35], [2, .15]]: média 0,65** |
| `SAFRA_DE_FORA` 43 / 42 | [[0, .85], [1, .15]] / [[0, .7], [1, .3]] | **[[0, .92], [1, .08]] / [[0, .85], [1, .15]]** (metade) |
| `REGUA_DE_FORA` (virada.js) ↔ `teto_do_clube` | nota 28, talento +14, teto 20 mi | **nota 28, talento 0, teto 19 mi** |
| Curva do salário (`salarioDeMercado`, economia.js) | 12% por ponto | **14% por ponto, a nota 41 custa o mesmo de hoje** |
| `TETO_DE_FOLHA` ↔ `divisoes.teto_folha` | {1: 20 mi, 2: 16 mi} | **{1: 19 mi, 2: 15 mi}** |
| `MAXIMO_INDIVIDUAL` | 15% | sem mudança: 15% de 19 mi = 2,85 mi, acima dos 1,99 mi da nota 43 |
| TV, patrocínio, ingresso e torcida (`divisoes`), `PREMIOS`, `PREMIO_MINIMO` | ver a tabela `divisoes` | **sem mudança até a decisão do caixa** |
| `NIVEL_DO_REINICIO` (admin.html) | {A: 30, B: 30, fora: 30} | **{A: 30, B: 30, fora: 34}** |
| **Novo:** `TALENTO_DO_REINICIO` (admin.html, nos elencos gerados) | — | **{A: −12, B: −12, fora: 0}** |
| **Novo, para decidir:** `TALENTO_DA_BASE` (base.js, `jovensDaBase`; o raro da safra não muda) | 0 (sorteio comum, média 58) | **−12** |

Salário com a curva nova (em mil por temporada, adulto de 22 a 30 anos; jovem −20%, veterano −10% como hoje):

| Nota | 25 | 30 | 33 | 35 | 37 | 38 | 40 | 41 | 42 | 43 |
|---|---|---|---|---|---|---|---|---|---|---|
| Hoje (12%) | 250 | 440 | 620 | 775 | 975 | 1.090 | 1.370 | 1.535 | 1.715 | 1.920 |
| Proposto (14%) | 188 | 362 | 538 | 697 | 908 | 1.034 | 1.346 | 1.535 | 1.746 | 1.989 |

O craque (41) passa a custar 2,2 vezes o jogador de 35 (hoje 2,0) e 8,2 vezes o de 25 (hoje 6,1). Um elenco da A madura (onze 38,3, reservas 35,1 e 33,2) custa 18,7 mi pela curva nova (20,2 mi pela de hoje), dentro do teto de 19 mi.

## Nota por idade (configuração recomendada)

Mediana da nota de quem entrou na liga com até 19 anos depois do reinício, nas T5–T14. "Comum de Série A" é talento 60–75 (teto 35 a 38). Abaixo de 60, o teto nem chega a reserva da A.

| Idade | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 25 | 27 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comum (60–75) | 23,8 | 25,7 | 28,2 | 31,5 | 34,6 | **36,2** | 37,0 | 37,1 | 37,1 | 37,1 |
| Bom (76–89) | 23,9 | 27,3 | 29,2 | 32,2 | 36,0 | 38,7 | 39,3 | 39,4 | 39,5 | 39,4 |
| Alto (≥ 90) | 24,8 | 28,9 | 31,5 | 34,1 | **38,0** | 41,4 | 42,0 | 42,2 | 42,5 | 43,1 |

Hoje, o comum chega a 35 aos 19,8 anos e o alto a 37,5 aos 19,4. Com o treino a 130, esses marcos passam para 20,3 e 19,9.

## Caixa: o problema e duas correções (nenhuma aplicada)

**O problema.** Com a escala e a curva novas, todos os elencos ficam mais baratos e os bots não gastam: só pagam a folha e repõem o elenco. Na configuração recomendada, o caixa mediano no fim de cada temporada fica assim (em mi):

| Grupo | T1 | T5 | T10 | T14 |
|---|---|---|---|---|
| Dono da A | 15,2 | 17,0 | 12,8 | 15,8 |
| Série B (mediana dos 24: 18 bots e 6 donos) | 21,0 | 41,0 | 81,3 | 108,6 |
| Clube de país | 22,1 | 51,1 | 94,7 | 126,2 |

Só os bots da B chegam a 110,6 mi na T14. O bot da B ganha ~7 mi por temporada e o clube de país ~9 mi. O dono da A não acumula: a folha prende no teto e as obras e compras gastam o resto. A força do rico continua limitada pelo teto, como o design pede. O dinheiro dos bots, porém, não tem destino nenhum.

Hoje (T14 real) os bots da B estão com 34,7 mi em média e os países com ~15 mi. A diferença entre o simulador e o real vem de duas coisas que o simulador não tem: os bots compram livres e negociam entre si, e os países de hoje têm folha perto do teto. Mesmo assim a direção é a mesma, e piora com a curva nova.

**Correção 1: imposto sobre o caixa parado.** Todo ano o clube paga 30% do que tiver em caixa acima de 1 teto de folha. O dinheiro sai da liga (ou vai para o fundo da taça).
- Efeito simulado na T14: bot da B de 110,6 para 30,6 mi; país de 126,2 para 37,3 mi; dono da A de 15,8 para 16,1 mi; nível igual.
- A favor: só pega quem acumula, vale para todos com a mesma regra e conversa com o imposto em faixas que já existe (122).
- Contra: é uma regra nova no fechamento da temporada (SQL e função), e o dono que guarda dinheiro para uma obra grande, como o estádio nível 7 ou 8 de 20 a 30 mi, paga o imposto enquanto junta. Talvez convenha isentar o que está reservado para uma obra em andamento.

**Correção 2: TV e patrocínio menores para o clube sem dono.** O clube sem dirigente recebe 40% da TV e do patrocínio da divisão. O dono continua recebendo o valor cheio.
- Efeito simulado na T14: bot da B de 110,6 para 23,8 mi; país de 126,2 para 31,8 mi; dono sem mudança; nível igual.
- A favor: é só um fator no lançamento da rodada, sem regra nova para o dono, e o dinheiro para de entrar em vez de sair depois.
- Contra: o agente paga as vendas dos donos com o caixa dos bots (a cotação depende dele). Bot mais pobre paga menos ao dono que vende ao agente, e o simulador não mede essa queda da cotação. Um bot que suba de série e ganhe folha alta pode ir para o vermelho.

**Testado e descartado:** cortar TV e patrocínio de todos. Com −40%, o dono da A fica com ~3 mi e o da B no vermelho, e os bots continuam com 48 a 56 mi.

## Para o dono do projeto decidir

1. **Os números da tabela "Valores propostos".** Aprovar, ou pedir outra rodada com mudanças.
2. **`TALENTO_DA_BASE = −12`, regra nova.** Os jovens da base dos donos nascem com 12 pontos a menos de talento (média 46 em vez de 58), e o raro da safra não muda.
   - Com a regra, a A madura fica em 38,3 e os reservas 12–16 a 3,2 do onze.
   - Sem ela, a A passa a 39,3 na T14 (+1,3 sobre o alvo), com 15 jogadores ≥ 42 na A.
   - Se ela não entrar, o plano B é aceitar a A em ~39 na liga madura, ou baixar o teto da A, o que encurta o elenco (achado 3).
3. **A correção do caixa:** a 1, a 2 ou nenhuma por enquanto. A Tarefa 8 só mexe em receitas e prêmios depois dessa resposta.
4. **O ritmo:** a A chega a 37 na T7, não na T5. Se isso importar, testo um nível próprio para os elencos dos donos no reinício.

## Como reproduzir

```
node ferramentas/sim_liga.mjs . 14 sementes=5 CONFIG_TREINO.pontosPorSessao=130 TALENTO_DO_JOVEM_POR_DIVISAO.2=-22 \
  REGUA_DE_FORA.talento=0 REGUA_DE_FORA.teto=19000 CURVA_DO_SALARIO=1.14 TETO_DE_FOLHA.1=19000 TETO_DE_FOLHA.2=15000 \
  NIVEL.fora=34 TALENTO_DO_REINICIO.A=-12 TALENTO_DO_REINICIO.B=-12 BASE.talento=-12 \
  CONFIG_SAFRA.niveis.0.quantos.0.1=0.8 CONFIG_SAFRA.niveis.0.quantos.1.1=0.2 CONFIG_SAFRA.niveis.0.quantos.2.1=0 \
  CONFIG_SAFRA.niveis.1.quantos.0.1=0.5 CONFIG_SAFRA.niveis.1.quantos.1.1=0.35 CONFIG_SAFRA.niveis.1.quantos.2.1=0.15 CONFIG_SAFRA.niveis.1.quantos.3.1=0 \
  SAFRA_DE_FORA.0.quantos.0.1=0.92 SAFRA_DE_FORA.0.quantos.1.1=0.08 SAFRA_DE_FORA.1.quantos.0.1=0.85 SAFRA_DE_FORA.1.quantos.1.1=0.15
```

Acrescente `IMPOSTO_DO_CAIXA=0.3` (correção 1) ou `RECEITA_DO_BOT=0.4` (correção 2). Sem `BASE.talento=-12`, sai a versão sem regra nova. Cada rodada de 5 sementes × 15 temporadas leva ~30 s.
