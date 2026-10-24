// Confere as leituras do visual novo (src/leituras.js): Vestiário pelo nível do analista, faixa da tabela e próximo jogo.
// node ferramentas/teste_leituras.mjs
import assert from "node:assert/strict";
import { leiturasDoVestiario, leituraDaTabela, leituraDoProximoJogo, posicoesPorRodada } from "../src/leituras.js";
import { classificacao } from "../src/rodada.js";

// ---------- Vestiário ----------
// zonas: [ganhos, perdidos]. Nós (lado 0) vencemos 6 de 8 no ataque pelo centro; o adversário venceu 6 de 8 no ataque pela esquerda dele = nossa defesa direita
const zonas = (sobre) => ({ DE: [4, 4], DC: [4, 4], DD: [4, 4], ME: [4, 4], MC: [4, 4], MD: [4, 4], AE: [3, 5], AC: [3, 5], AD: [3, 5], ...sobre });
const rel = {
  estat: [{ zonas: zonas({ AC: [6, 2] }) }, { zonas: zonas({ AE: [6, 2] }) }],
  jogadores: [
    { nome: "Tiago Moura", pos: "SC", time: 0, saiu: null, energia: 50, minutos: 90 },
    { nome: "Juninho", pos: "MC", time: 0, saiu: null, energia: 55, minutos: 90 },
    { nome: "Fabinho", pos: "MC", time: 0, saiu: null, energia: 80, minutos: 90 },
    { nome: "Goleiro", pos: "GK", time: 0, saiu: null, energia: 30, minutos: 90 },
    { nome: "Trocado", pos: "MC", time: 0, saiu: 60, energia: 40, minutos: 60 },
    { nome: "Rival", pos: "MC", time: 1, saiu: null, energia: 20, minutos: 90 },
  ],
  analise: [["O placar reflete o jogo: 1,84 de xG nosso contra 0,92 do adversário."], ["outro lado"]],
};
const elenco = [{ nome: "Edinho", pos: "DMC", fora: 1, motivo: "suspensão" }, { nome: "Kauã", pos: "LW", juvenil: true, fora: 2, motivo: "lesão" }, { nome: "Biel", pos: "DC", fora: 0 }];
const v3 = leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco });
assert.deepEqual(v3.map(l => l.tipo), ["falhou", "desfalque", "funcionou", "atencao"]);
assert.deepEqual(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 2, elenco }).map(l => l.tipo), ["falhou", "desfalque", "funcionou", "atencao"]);
assert.deepEqual(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 1, elenco }).map(l => l.tipo), ["desfalque", "atencao", "resultado", "bloqueada"]);
const por = t => v3.find(l => l.tipo === t);
assert.equal(por("falhou").titulo, "Pela nossa defesa direita");
assert.equal(por("falhou").frase, "O adversário venceu 75% dos duelos ali.");
assert.deepEqual(por("falhou").acao, { texto: "Ajustar a tática", abaIr: "tatica", tipo: "principal" });
assert.equal(por("funcionou").titulo, "O ataque pelo centro funcionou");
assert.equal(por("funcionou").frase, "75% dos duelos vencidos ali.");
assert.equal(por("funcionou").acao.tipo, "link");
assert.equal(por("desfalque").titulo, "Edinho está suspenso"); // o juvenil não conta
assert.equal(por("desfalque").frase, "Fora por 1 jogo.");
assert.equal(por("atencao").titulo, "Terminaram cansados");
assert.equal(por("atencao").frase, "Tiago Moura e Juninho."); // nem o goleiro, nem quem saiu, nem o rival
const bloq = leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 1, elenco }).at(-1);
assert.deepEqual(bloq, { tipo: "bloqueada", titulo: "Por onde o jogo foi decidido", frase: "Contrate um analista para ver as zonas do jogo.", acao: { texto: "Ver a comissão", abaIr: "clube", tipo: "link" } });
// dois desfalques; do outro lado da partida, a leitura vira
const dois = leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco: [...elenco, { nome: "Biel", pos: "DC", fora: 2, motivo: "lesão" }] }).find(l => l.tipo === "desfalque");
assert.equal(dois.titulo, "2 desfalques");
assert.equal(dois.frase, "Edinho (suspensão, 1 jogo) e Biel (lesão, 2 jogos).");
// visto do lado 1: o adversário (lado 0) venceu 75% no ataque pelo centro → o centro da nossa defesa
assert.equal(leiturasDoVestiario({ relatorio: rel, lado: 1, nivel: 3, elenco: [] }).find(l => l.tipo === "falhou").titulo, "Pelo centro da nossa defesa");
// relatório nulo, velho ou incompleto: nada ou só o que dá para afirmar, sem erro
assert.equal(leiturasDoVestiario({ relatorio: null, lado: 0, nivel: 3, elenco }).length, 0);
assert.doesNotThrow(() => leiturasDoVestiario({ relatorio: { analise: [["ok"], []] }, lado: 0, nivel: 3, elenco: [] }));
assert.deepEqual(leiturasDoVestiario({ relatorio: { analise: [["ok"], []] }, lado: 0, nivel: 3, elenco: [] }).map(l => l.tipo), ["resultado"]);
assert.deepEqual(leiturasDoVestiario({ relatorio: {}, lado: 0, nivel: 1, elenco: [] }).map(l => l.tipo), ["bloqueada"]);
assert.ok(leiturasDoVestiario({ relatorio: { estat: [{ zonas: { AC: [1, 0] } }, { zonas: {} }] }, lado: 0, nivel: 3, elenco: [] }).every(l => l.tipo !== "funcionou")); // menos de 6 duelos
// mesmo dado → mesma saída
assert.deepEqual(leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco }), leiturasDoVestiario({ relatorio: rel, lado: 0, nivel: 3, elenco }));

// ---------- faixa da tabela ----------
const nomes = ["Locomotiva", "Real Dormente", "União Bitola Larga", "Campinense", "Ferroviário", "Maria Fumaça", "Vagão FC", "Trilho"];
const pts = [30, 28, 26, 25, 23, 20, 15, 10];
const tab = nomes.map((nome, i) => ({ clube: { id: i + 1, nome }, j: 14, pts: pts[i] }));
const faixas = ["sobe", "sobe", "playoff", "playoff", "", "", "cai", "cai"];
assert.deepEqual(leituraDaTabela({ tab, clubeId: 5, faixas, rodadasRestantes: 8 }), { titulo: "5º lugar ·", apagado: "faltam 8 rodadas", destaque: "A 2 pontos da zona do playoff.", frase: "" });
assert.deepEqual(leituraDaTabela({ tab, clubeId: 3, faixas, rodadasRestantes: 1 }), { titulo: "3º lugar ·", apagado: "falta 1 rodada", destaque: "", frase: "3 pontos à frente do 5º." });
assert.deepEqual(leituraDaTabela({ tab, clubeId: 1, faixas, rodadasRestantes: 8 }).frase, "4 pontos à frente do 3º.");
assert.deepEqual(leituraDaTabela({ tab, clubeId: 7, faixas, rodadasRestantes: 8 }), { titulo: "7º lugar ·", apagado: "faltam 8 rodadas", destaque: "Na zona de rebaixamento.", frase: "5 pontos para sair." });
assert.equal(leituraDaTabela({ tab, clubeId: 6, faixas, rodadasRestantes: 0 }).apagado, "fim da fase");
const tabZerada = tab.map(t => ({ ...t, j: 0, pts: 0 }));
assert.deepEqual(leituraDaTabela({ tab: tabZerada, clubeId: 5, faixas, rodadasRestantes: 14 }), { titulo: "5º lugar ·", apagado: "faltam 14 rodadas", destaque: "", frase: "" });
assert.equal(leituraDaTabela({ tab, clubeId: 99, faixas, rodadasRestantes: 8 }), null);
const empate = tab.map(t => t.clube.id === 4 ? { ...t, pts: 23 } : t);
assert.equal(leituraDaTabela({ tab: empate, clubeId: 3, faixas, rodadasRestantes: 8 }).frase, "3 pontos à frente do 5º.");
assert.equal(leituraDaTabela({ tab: empate, clubeId: 5, faixas, rodadasRestantes: 8 }).destaque, "Empatado em pontos com a zona do playoff.");
// ---------- próximo jogo ----------
assert.deepEqual(leituraDoProximoJogo({ tab, clubeId: 5, rivalId: 4, formaDoRival: ["E", "V", "V", "V"] }), { titulo: "Confronto direto", frase: "O Campinense está a 2 pontos de você. Chega com 3 vitórias seguidas." });
assert.deepEqual(leituraDoProximoJogo({ tab: empate, clubeId: 5, rivalId: 4, formaDoRival: [] }), { titulo: "Confronto direto", frase: "O Campinense está empatado com você em pontos." });
assert.deepEqual(leituraDoProximoJogo({ tab, clubeId: 5, rivalId: 1, formaDoRival: ["V", "V"] }), { titulo: "Locomotiva, 1º colocado", frase: "" });
assert.equal(leituraDoProximoJogo({ tab, clubeId: 5, rivalId: null, formaDoRival: [] }), null);
assert.equal(leituraDoProximoJogo({ tab, clubeId: 5, rivalId: 77, formaDoRival: [] }), null); // rival de outro grupo (copa)

// ---------- posição rodada a rodada ----------
const clubes4 = [1, 2, 3, 4].map(id => ({ id, nome: "C" + id }));
const partidas4 = [[1, 1, 2], [2, 3, 4], [3, 1, 3], [4, 2, 4], [5, 1, 4], [6, 2, 3]].map(([id, casa, fora], k) => ({ id, casa, fora, rodada: Math.floor(k / 2) + 1, fase: "liga" }));
const resultados4 = [[1, 2, 0], [2, 1, 0], [3, 0, 1], [4, 0, 0], [5, 0, 3], [6, 1, 1]].map(([partida_id, gols_casa, gols_fora]) => ({ partida_id, gols_casa, gols_fora, pts_esp_casa: 0, pts_esp_fora: 0 }));
const pos = posicoesPorRodada(clubes4, partidas4, resultados4, 1);
assert.equal(pos.length, 3);
assert.equal(pos[0], 1); // o clube 1 vence a 1ª rodada por 2 gols, o único com saldo 2
assert.equal(pos[2], classificacao(clubes4, partidas4, resultados4).findIndex(t => t.clube.id === 1) + 1);
assert.deepEqual(posicoesPorRodada(clubes4, [], [], 1), []);
assert.equal(posicoesPorRodada(clubes4, partidas4, resultados4.slice(0, 2), 1).length, 1); // rodada sem resultado não entra

// sem calendário (início de temporada, temporada 0): sem "fim da fase"
assert.deepEqual(leituraDaTabela({ tab: tabZerada, clubeId: 5, faixas, rodadasRestantes: null }), { titulo: "5º lugar ·", apagado: "calendário a sortear", destaque: "", frase: "" });
// Série B desde a T14: os dois primeiros vão à semifinal do playoff, não sobem direto
assert.equal(leituraDaTabela({ tab, clubeId: 3, faixas: ["", "sobe", "sobe", "playoff", "", "", "cai", "cai"], rodadasRestantes: 8 }).frase, "1 ponto à frente do 4º.");
assert.equal(leituraDaTabela({ tab, clubeId: 4, faixas: ["sobe", "sobe", "", "", "", "", "", ""], rodadasRestantes: 8 }).destaque, "A 3 pontos da zona da semifinal.");
// "funcionou" só quando a melhor zona venceu mais da metade dos duelos (33% não é sucesso)
const fraco = { estat: [{ zonas: zonas({ AE: [2, 6], AC: [3, 6], AD: [1, 7] }) }, { zonas: zonas({}) }], jogadores: [], analise: [["ok"], []] };
assert.ok(leiturasDoVestiario({ relatorio: fraco, lado: 0, nivel: 3, elenco: [] }).every(l => l.tipo !== "funcionou"));
// cada leitura de zona diz qual zona do nosso campo ela cita (para o campo do vestiário acender)
assert.equal(v3.find(l => l.tipo === "falhou").zona, "DD");
assert.equal(v3.find(l => l.tipo === "funcionou").zona, "AC");
// destaque: o melhor em campo do nosso lado (com o analista nível 3), como "o que deu certo" de todo jogo
const comMelhor = { ...rel, melhor: { nome: "Pedrinho Pitimbu", time: 0, nota: 8.4 } };
const dst = leiturasDoVestiario({ relatorio: comMelhor, lado: 0, nivel: 3, elenco: [] }).find(l => l.tipo === "destaque");
assert.deepEqual(dst, { tipo: "destaque", titulo: "Pedrinho Pitimbu foi o melhor em campo", frase: "Nota 8,4 no jogo." });
assert.ok(!leiturasDoVestiario({ relatorio: comMelhor, lado: 0, nivel: 2, elenco: [] }).some(l => l.tipo === "destaque")); // só com analista nível 3
assert.ok(!leiturasDoVestiario({ relatorio: comMelhor, lado: 1, nivel: 3, elenco: [] }).some(l => l.tipo === "destaque")); // o melhor era do outro lado
