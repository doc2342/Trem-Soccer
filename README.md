# Manager DO-BR Online

Liga online de manager para os amigos do DO-BR. O desenho do jogo está no documento de projeto; este repositório guarda o código, construído em passos pequenos.

## Fase 1 (temporada-teste)

| Passo | Situação |
| --- | --- |
| A. Jogadores (22 atributos, 18 posições, gerador de elenco) | pronto |
| B. Motor: núcleo (9 zonas, xG) | pronto |
| C. Calibragem | pronto |
| D. Instruções e energia | pronto |
| E. Bot e relatório | pronto |
| F. Tela de escalação | pronto |
| G. Contas e clubes | a fazer |
| H. Rodada no servidor | a fazer |
| I. Lançamento fechado | a fazer |

## Arquivos

- `src/rng.js`: aleatório com semente (o mesmo resultado no navegador e no servidor).
- `src/modelo.js`: atributos, posições, pesos da nota por posição, familiaridade.
- `src/gerador.js`: gerador de jogador e de elenco inicial equilibrado.
- `dados/nomes.json`: nomes e sobrenomes por país (gerado por `ferramentas/extrair_nomes.py`).
- `src/escalacao.js`: formações de referência e escalação automática simples.
- `src/motor.js`: motor da partida (zonas, duelos, chances com xG).
- `src/bot.js`: tática de bot (formação, escalação, banco e instruções).
- `src/relatorio.js`: relatório da partida (resultado esperado, notas, mapa de zonas, analista).
- `elenco.html`: página de conferência do passo A.
- `relatorio.html`: partida entre dois bots com o relatório completo.
- `escalacao.html`: montar o time, as instruções e as substituições, salvar escalações e jogar contra um bot.
- `src/ui-relatorio.js` e `estilo.css`: desenho do relatório e estilo compartilhados pelas telas.
- `partida.html`: uma partida (ou 1.000) entre dois times, com as instruções de cada um.
- `calibragem.html`: roda milhares de partidas e compara com as metas; mostra também o efeito de cada instrução.

## Rodar localmente

```
python -m http.server 8797
```

Depois abrir `http://localhost:8797/elenco.html` ou `http://localhost:8797/partida.html`.
