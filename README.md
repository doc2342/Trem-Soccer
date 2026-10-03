# Manager DO-BR Online

Liga online de manager para os amigos do DO-BR. O desenho do jogo está no documento de projeto; este repositório guarda o código, construído em passos pequenos.

## Fase 1 (temporada-teste)

| Passo | Situação |
| --- | --- |
| A. Jogadores (22 atributos, 18 posições, gerador de elenco) | pronto |
| B. Motor: núcleo (9 zonas, xG) | pronto, sem calibragem |
| C. Calibragem | a fazer |
| D. Instruções e energia | a fazer |
| E. Bot e relatório | a fazer |
| F. Tela de escalação | a fazer |
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
- `elenco.html`: página de conferência do passo A.
- `partida.html`: página de conferência do passo B (uma partida ou 1.000).

## Rodar localmente

```
python -m http.server 8797
```

Depois abrir `http://localhost:8797/elenco.html` ou `http://localhost:8797/partida.html`.
