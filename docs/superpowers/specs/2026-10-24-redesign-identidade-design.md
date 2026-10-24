# Redesign: uma identidade só para o Trem Soccer

Data: 2026-10-24. Conversa de brainstorming com o dono do projeto; modelos no companheiro visual (`.superpowers/brainstorm/`, fora do git).

## Por quê

O dono quer mudar o design por três motivos, nas palavras dele:

1. **Identidade.** Cada parte do site parece feita por uma pessoa diferente. O site precisa de uma linguagem só.
2. **Poluição visual.** Tudo tem o mesmo peso, e há notas de rodapé por toda parte: o `jogo.html` tem ~280 trechos em `class="mut"` e 36 `class="aviso"`, a maioria explicando a própria tela ("Esta página também confere sozinha a cada minuto.").
3. **Cara de IA.** O visual atual (cards arredondados para tudo, grade de KPIs, marinho e dourado, abas com emoji) parece genérico.

A tela ao vivo é "o menor dos problemas", mas entra no redesign para o site ter uma cara só.

## Referências (o que o dono aprovou)

- **A home `prototipos/home_trem.html`**: linguagem tirada de quatro DESIGN.md (`prototipos/referencias/`: Apple, BMW, Nike, PlayStation) + vocabulário de trem (embarque, bilhete, estação). É a base.
- **Football Manager**: a sensação de estar gerenciando um clube.
- **Nove recortes de protótipos** que o dono escolheu (imagens em `2026-10-24-redesign-referencias/`; vêm de `tela_abas.html`, `tela_central_ref.html`, `tela_partida_vestiario.html`, `tela_jogo.html`, `tela_mercado.html`): Vestiário ("O que levar para a rodada 16"), Próximo jogo, Boleta de negociação, fita de transferências, Bastidores (notícias + confiança da diretoria), Instruções da tática, Promessa da temporada, Série B com gráfico de posição, Finanças + níveis do estádio.
- **O que falhou antes:** em `tela_abas.html` a linguagem das referências aplicada às abas ficou com cara de site de marca, não de jogo de gestão. As referências são vitrines; um jogo de gestão é lido e comparado todo dia. Por isso a regra 2 abaixo.

## Objetivos

- Uma gramática visual única em todas as telas do jogador (lista em "Escopo").
- Cada tela com **um** foco claro, poucos secundários, o resto quieto ou atrás de um clique.
- Cara de jogo de gestão de futebol, não de vitrine e não de "painel gerado".
- Tema claro como padrão, escuro como opção, os dois desenhados (não um invertido do outro).
- Estrear junto com o reinício da liga (fim da T14), **sem prazo**: a chave só vira quando tudo estiver pronto.

## Não objetivos

- Mudar regras do jogo, o motor ou o banco. A exceção são as **leituras** (seção abaixo): frases novas tiradas de dados que já existem, aprovadas pelo dono.
- Telas de desenvolvimento e administração: `admin.html`, `relatorio.html`, `calibragem.html`, `elenco.html`, `partida.html`, `escalacao.html`. Ficam como estão (podem herdar os tokens de graça, mas não são redesenhadas).
- Reescrever o `jogo.html` do zero ou trocar de tecnologia (sem framework, sem build, sem Tailwind no site).

## Anti-objetivos (falhou mesmo que "funcione")

- Uma tela onde o olho não sabe para onde ir.
- O "limpo demais" de `prototipos/tela_mercado_limpo.html` v1: tudo branco e cinza do mesmo tamanho. Hierarquia precisa de contraste de **tamanho e de cor**.
- Voltar a ter frases explicando a tela.
- Um tema escuro que é o claro com as cores trocadas.
- Qualquer resultado de jogo, número ou previsão diferente do que o site mostra hoje (é redesign, não mudança de regra). Leituras novas dizem o que os números significam; não criam números que contradigam os de hoje.

## Leituras (peça nova, aprovada pelo dono)

A regra 2 (dado → frase → ação) precisa de frases que o site ainda não escreve. O dono aprovou criá-las a partir dos dados que já existem, e que **o quanto o Vestiário mostra dependa do analista contratado**, como já acontece com o comentário pós-jogo e a prévia do adversário (`nivelDoAnalista` em `src/saude.js`).

- **Fontes:** relatório da partida (corredores E/C/D, posse, finalizações, gols; `src/banco.js` já agrega o estilo observado), energia e forma dos jogadores, cartões e suspensões, lesões, tabela e calendário, caixa e estruturas.
- **Onde:** um módulo puro em `src/` (proposta: `src/leituras.js`) que recebe os dados e devolve leituras `{ tipo: funcionou|falhou|atenção|desfalque|…, título, frase, número?, ação? }`. Sem `Math.random()`: o mesmo dado sempre dá a mesma frase. Com teste em `ferramentas/teste_leituras.mjs`.
- **Analista:** sem analista, o Vestiário mostra só o básico (resultado, desfalques, cansaço: o que o dirigente vê de qualquer jeito); com analista, entram as leituras de zona ("46% dos ataques do rival pelo nosso lado direito"), e nos níveis mais altos as de jogadores e bolas paradas, na mesma escada do comentário pós-jogo de hoje. A tela diz o que falta sem virar nota de rodapé (ex.: um card apagado "Contrate um analista para ver por onde o jogo foi decidido").
- **Leituras previstas:** Vestiário pós-jogo (Central), Próximo jogo ("confronto direto pelo G-4", sequência do rival), faixa de foco de cada aba (situação na liga, promessa da base, saúde do caixa), Bastidores (mercado, base, departamento médico).
- **Limite:** cada tela mostra poucas leituras (proposta: até 4 no Vestiário), escolhidas por importância; o resto não aparece.

## A gramática (vale para todas as telas)

1. **Foco: uma faixa escura.** Cada tela abre com UM destaque, a manchete do que mais importa agora ("4º lugar · 8 rodadas"; "Kauã Itaberaba"). Título pesado e estreito, uma frase em negrito + uma normal, e no máximo um gráfico ou número à direita.
2. **Leitura: dado → frase → ação.** O número, uma frase dizendo o que ele significa *para o seu clube*, e o botão para agir ("46% dos ataques pelo nosso lado direito" → **Ajustar a tática**). É isso que dá a cara de gestão: o jogo é um auxiliar que aponta o que importa.
3. **Documento: papel só em papel.** Boleta de negociação, contrato, bilhete de cadastro, recibo de obra: fundo bege, letra de máquina nos campos, linhas tracejadas, carimbo. Nada mais no site é papel.
4. **Silêncio: texto só quando fala do clube.** Instrução de uso some. O que for indispensável vira um "?" que abre a explicação, ou um aviso que só aparece quando algo está errado (ex.: "Pedrinho está suspenso. Troque o lateral antes de salvar.").
5. **Esqueleto fixo.** Toda aba: faixa de foco → leituras → detalhe (tabelas, listas). Mesmo rótulo de seção (traço vermelho + caixa-alta espaçada), mesmo estilo de número grande com legenda pequena, mesmos papéis de cor.
6. **Frase única.** Se a faixa de foco de uma aba precisa de duas manchetes, a aba está tentando mostrar duas coisas: escolher uma.
7. **Uma fonte de números.** Faixa, leituras e tabelas da mesma tela leem do mesmo objeto; nenhuma peça recalcula por conta própria.
8. **Só o próximo passo ativo** em fluxos de várias etapas (cadastro, boleta, obra do estádio).

### Cor

- **Vermelho = marca Trem Soccer**, fixo em todo clube: traço dos rótulos, estação atual da navegação, o "foco" das faixas. Decidido pelo dono.
- **Cor do clube** (do escudo, como hoje no `atualiza.js`): o botão da ação principal e o que é do clube (escudo, camisa). Hoje o `atualiza.js` tira o vermelho da cor de destaque; com o vermelho agora sendo marca, essa regra continua fazendo sentido (um clube vermelho usa a segunda cor), e precisa garantir contraste do botão nos dois temas.
- **Derrota, erro, cartão:** saem do vermelho da marca para um tom próprio (proposta: vermelho-alaranjado mais escuro, distinguível do vermelho da marca; o construtor escolhe e testa lado a lado).
- **Bom / atenção / ruim** com uma cor cada (verde, âmbar, o tom de erro), sempre com significado.
- **Mandante × visitante** continuam fora das cores de clube (turquesa × âmbar, roxo × âmbar nos Ajustes), como hoje.
- Competições com cor própria onde já têm (Libertadores dourado etc.).

### Tipografia

- **Archivo** (eixo de largura): pesada e estreita (`font-stretch` ~62–75%) nos títulos e números grandes; fina e normal no texto. Uma família só no site.
- **Letra de máquina só nos documentos** (proposta: Martian Mono, já usada no protótipo da boleta).
- Números sempre `tabular-nums`.
- Sem Barlow (sai junto com o visual atual), sem Inter/Roboto/system.

### Movimento

CSS primeiro. Uma entrada orquestrada por tela (subida em cascata, como `.sobe` da home), não microanimações espalhadas. Respeitar `prefers-reduced-motion`.

## Navegação

- **Escolhida (por enquanto): C2, a linha com estações.** Um trilho com bolinhas e o nome de cada estação; a atual em vermelho e maior.
  - **No celular:** embaixo, ao alcance do polegar, com as sete estações visíveis (o dono quer ver todas as abas).
  - **No PC:** em cima, com os nomes inteiros.
- **Guardada como alternativa: B3, a composição** (cada aba um vagão, Central = locomotiva na cor do clube; no celular, sete vagões embaixo). O dono gostou da B no PC; pode voltar.
- **Estações:** Central, Elenco, Tática, Base, Mercado, Clube, Liga. "Competições" vira **Liga**; "Mercado" pode encurtar para "Merc." só no celular.
- **Ajustes** sai da linha (é a 8ª aba hoje): vai para o escudo / nome do clube no topo. *Decisão minha, não do dono.*
- Sem emoji nas abas.
- Topo fixo enxuto: escudo + nome do clube, próximo jogo (rodada, dia, hora).

## Tema

- **Claro é o padrão** para todo mundo (hoje o padrão segue o aparelho). Decisão do dono: "cada dirigente gosta de uma maneira, então padroniza o claro, mas precisamos ter a opção escura".
- **Escuro** como opção nos Ajustes (o `atualiza.js` já guarda `mo_tema`; o "automático" pode continuar como terceira opção, mas não é mais o padrão).
- No escuro, as faixas de foco (que já são escuras no claro) precisam de outro tratamento para continuar sendo o foco (ex.: mais claras que o fundo, ou com o brilho vermelho mais forte). Cada peça é desenhada e conferida nos dois temas.

## Escopo (telas)

| Tela | Arquivo | Observação |
|---|---|---|
| Central | `jogo.html` | Faixa = situação na liga; leituras = Vestiário (pós-jogo), Próximo jogo, Bastidores. Partir dos recortes aprovados e de `tela_jogo.html` / `tela_central_ref.html`. |
| Elenco | `jogo.html` | Lista de jogadores: nome em negrito, linha apagada, nota grande, preço em destaque (aprovado em `tela_mercado_limpo.html`). |
| Tática | `jogo.html` | Instruções em botões segmentados (recorte aprovado); aviso só se houver problema. |
| Base | `jogo.html` | Faixa = promessa da temporada (recorte aprovado). |
| Mercado | `jogo.html` | Boleta como documento; fita de transferências com hierarquia interna, uma cor por tipo de transferência. |
| Clube | `jogo.html` | Finanças (barras de receita/despesa) + estádio por níveis (recorte aprovado). |
| Liga | `jogo.html` | Tabelas, chaves de mata-mata, gráfico de posição. |
| Ajustes | `jogo.html` | Tema claro/escuro, cores de mandante/visitante etc. |
| Ao vivo | `aovivo.html` | Repensado na gramática nova; manter o que funciona (placa do quarto árbitro, barra de pênaltis, wipe de gol, gráficos de momento/xG). |
| Guia do dirigente | `guia.html` | Na gramática nova + a primeira máquina (abaixo). |
| Outras telas do jogador | `sede.html`, `temporada.html`, `jogador.html`, `partida_base.html` | Mesma gramática. |
| Home | `index.html` | Substituída pela linha de `prototipos/home_trem.html` (já aprovada como candidata), adaptada sem Tailwind. |

## O que entra do artigo da skill `anatomy`

(Artigo de @elvar_official; skill instalada em `~/.claude/skills/anatomy`.) O dono pediu para eu escolher.

- **Regras 5 a 8 da gramática** vêm daí (esqueleto fixo, frase única, uma fonte de números, só o próximo passo ativo).
- **Revisão em imagem:** toda tela redesenhada é fotografada (celular de 375 px e PC, claro e escuro) e conferida: texto vazando da caixa, peças escondidas, números que não batem, animação com salto.
- **Primeira máquina do guia: "O que vence o quê"** (duelo de táticas, interativo, feito com a skill `anatomy` no visual novo). Escolhida porque as regras dela não mudam no reinício. Os números vêm do motor de verdade (`src/`), não de uma ilustração.
- **Depois do reinício (fora deste projeto):** máquinas de treino, receitas/despesas e acesso/descenso (o reinício recalibra justamente essas regras); relatório pós-jogo como máquina e replay manual/automático (conversa com `prototipos/rota_reprise.html`).

## Abordagens consideradas

| | Abordagem | Troca |
|---|---|---|
| A | Trocar só tokens e fontes do `estilo.css` | Rápido, mas não resolve nada: a cara de IA e a poluição estão na estrutura (card para tudo, KPIs, notas), não na cor. Descartada. |
| **B** | **Sistema novo primeiro, depois aba por aba dentro do `jogo.html`, atrás de uma chave** | Estreia junto com o reinício sem prazo; fica tudo no `main`, junto do trabalho do reinício (que mexe nos mesmos arquivos) e dos consertos que vão direto para o `main`. Custo: velho e novo convivem durante a obra. **Escolhida pelo dono.** |
| C | App novo numa página separada, troca o link na virada | Resultado mais limpo e quebra o `jogo.html` de 400 KB, mas a lógica das telas está no script do `jogo.html`, não em `src/`: reescrever tudo, com risco de perder comportamento, no mesmo momento do reinício. |

## Como construir (B)

1. **A chave.** Um atributo no `<html>` (proposta: `data-visual="novo"`), ligado pelo `atualiza.js` a partir de uma preferência local (`mo_visual`) que o dono e os testadores ligam; na virada, passa a ser o padrão e o visual velho é apagado.
2. **O sistema.** CSS novo com tokens (claro e escuro) e as peças da gramática: faixa de foco, rótulo de seção, número grande, cartão de leitura (dado → frase → ação), documento, linha de estações, botões (principal na cor do clube, secundário), botões segmentados, tabela, barra, fita. Funções de montagem compartilhadas num `src/ui-*.js` (as telas montam HTML em texto, então as peças viram funções que devolvem texto).
3. **Guia de design.** Uma página que mostra cada peça nos dois temas, como referência para quem constrói.
4. **Aba por aba.** Reescrever a montagem de cada aba com as peças, cortando as notas no caminho. Ao tocar uma aba, tirar os `style="…"` soltos dela (hoje 367 no `jogo.html`). Ordem sugerida: navegação e topo → Central → Elenco → Tática → Mercado → Clube → Liga → Base → Ajustes → ao vivo → guia (com a máquina) → outras telas → home.
5. **Virada.** Quando tudo estiver pronto e conferido, junto com o reinício: a chave vira padrão, o CSS e a montagem velhos saem.

## Restrições

- Site estático, módulos ES, sem build. Fontes do Google Fonts. Nada de `Math.random()` em caminho do motor (a máquina do guia usa o motor com semente).
- `atualiza.js`: a lista `ARQUIVOS` é refeita pelo `publicar.py`; módulo novo fora de `src/` não é atualizado no cache.
- `banco.js` tolera esquemas antigos; o redesign não muda consultas.
- Português do Brasil em tudo.
- Funcionar a 375 px sem rolagem lateral; área de toque confortável nas estações.
- Acessibilidade básica: contraste AA nos dois temas, foco visível, cor nunca é a única pista (estação atual também é maior; bom/ruim também tem sinal ou texto).

## Decisões minhas (o dono pode reverter)

- **Referências visuais:** as nove imagens que o dono escolheu estão em `2026-10-24-redesign-referencias/` (01 a 09), e o modelo de navegação no celular em `navegacao-celular.html` (C2 e B3). São **direção, não cópia** (palavras do dono): mostram o tom e a hierarquia; quem constrói adapta o que precisar.
- **Convivência com o reinício:** nenhuma aba espera o reinício. Enquanto a chave não vira, uma aba redesenhada existe em duas versões; se uma tarefa do reinício (`docs/superpowers/plans/2026-10-23-reinicio-escala-treino-economia.md`: grupos B/C/D, receitas por temporada, previsão do treino) mexer numa aba já refeita, a mudança entra nas duas versões até a virada.
- **Home:** substitui o `index.html` só na virada. O bilhete de cadastro usa o mesmo login de hoje (`src/ui-login.js`, código por e-mail) e leva ao `jogo.html`; a home não ganha fluxo de login próprio.
- **Modo "tela de PC no celular" (`mo_tela=pc`)** continua: nele, o celular recebe o layout de PC (linha em cima).
- **Claro como padrão** só vale na virada; até lá, quem não ligou a chave continua com o tema de hoje.
- **Ajustes** vai para o escudo/nome do clube no topo.

## Fica para quem constrói

- Valores exatos de cor, especialmente o tom de erro/derrota e o tratamento das faixas no escuro (decidir lado a lado nos dois temas).
- Nome e formato exato da chave e das funções de montagem.
- Qual peça usar em cada bloco de cada aba, seguindo a gramática e partindo dos recortes aprovados (como direção, não como molde).
- Quais notas cortar, quais viram "?" e quais viram aviso condicional: critério da regra 4.
