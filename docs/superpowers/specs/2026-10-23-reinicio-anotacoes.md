# Reinício da liga: anotações do brainstorm (rascunho, ainda não é o design)

Contexto: a liga reinicia no fim da T14. Pirâmide: Série A (12, todos com dono) e Série B em três grupos de 8 (B, C, F). Sem Série C.

## Decidido
- Nota máxima continua 43 (até 45 com a folga do treino). Motor da partida não é recalibrado.
- Alvos de onze mediano na liga madura: Série A 37–38; clubes de fora (ARG/URU/COL/CHI) 36–37; Série B 33–34.
- Quem sobe da B sofre na maioria dos casos; quem se estruturou na B (CT, base, treinadores) pode brigar do meio para cima.
- Elenco alvo na A: ~22 adultos (11 + 11), com os primeiros reservas a 2–3 pontos dos titulares; juvenis complementam.
- Juvenil só joga no profissional com contrato assinado (aí paga salário e conta no teto) — continua sem custo antes disso.
- Treino: sai o freio por idade; o talento manda. Jogador comum vira reserva da A por volta dos 21; craque titular entre 18 e 20.
- Treino contado por temporada, não por jogo (hoje A tem 22 sessões e a B 14).

## A anotar / rever
- Curva de salário mais inclinada (13–15% por ponto, a calibrar), âncora no craque.
- Tetos de folha da A, da B e dos países, recalibrados para a escala e a curva novas.
- Travas do mercado que mexem com dinheiro: máximo individual (15% do teto), multa = 5× salário, contrato dentro do teto.
- Caixa acumulado sem destino: bots da B com 34,7 mi em média (2× o teto); dono da A de −2,3 a 71 mi. A curva nova sobra mais dinheiro.
- Receitas (TV, patrocínio, bilheteria, prêmios) por divisão.
- Safra de raros (nível 42/43 por temporada) na escala nova.
- Nota de chegada da base (15 + 1,5 por nível, 13–25) casando com o treino novo; conferir que o juvenil não fica pronto cedo demais.
- Bots: CT por divisão (`ctSemDono`) ainda tem a Série C.
- Restos da Série C: teto 10 mi, prêmios, nota e talento do jovem da C.
- `ferramentas/saude.mjs` trata o grupo F como país.
- Ferramentas de simulação (`sim_escada`, `sim_treino`) ainda em três divisões.
- Geração dos elencos da liga nova já na escala nova.

## Fora do escopo
- Travas de fluxo do mercado (4 compras, protegidos, 5 jogos, perdas por clube…).
- Metas da diretoria (são relativas à força, não precisam de ajuste).
