// Confere a pirâmide da T14: a transição (sobem 2 priorizando dirigente ativo, serpentina da Série B, guardados) e o acesso e descenso
// normal (caem 3 da A, sobe o vencedor do playoff de cada B, um rebaixado para cada grupo que cedeu). Uso: node ferramentas/teste_piramide.mjs
import assert from "node:assert";
import { movimentosDaTransicao, movimentos } from "../src/virada.js";
import { criarRng } from "../src/rng.js";

// T13: A (10), B e C (Série B, 10 cada), D e E (Série C, 10 cada). Ids: A 1–10, B 11–20, C 21–30, D 31–40, E 41–50; posição = ordem do id.
const grupos = {}, clubes = [];
for (const [k, g] of ["A", "B", "C", "D", "E"].entries()) {
  grupos[g] = Array.from({ length: 10 }, (_, i) => ({ clube_id: k * 10 + i + 1, grupo: g, posicao: i + 1, pontos: 40 - 3 * i }));
  grupos[g].forEach(l => clubes.push({ id: l.clube_id, grupo: g, divisao: g === "A" ? 1 : "BC".includes(g) ? 2 : 3 }));
}
const forca = Object.fromEntries(clubes.map(c => [c.id, 100 - c.id])); // o de id menor é o mais forte
const ativos = new Set([14]); // o "Moços": 4º da B1, com dirigente ativo
const t = movimentosDaTransicao({ clubes, grupos, forca, ativo: c => ativos.has(c.id) });
const para = Object.fromEntries(t.lista.map(m => [m.clube_id, m.grupo]));
const grupoNovo = id => para[id] || clubes.find(c => c.id === id).grupo;
// sobem o ativo (14) e o campeão da B2 (21), que ainda não tinha mandado ninguém
assert.deepEqual(t.lista.filter(m => m.grupo === "A").map(m => m.clube_id).sort((a, b) => a - b), [14, 21]);
assert.equal(clubes.filter(c => grupoNovo(c.id) === "A").length, 12);
for (const g of ["B", "C", "F"]) assert.equal(clubes.filter(c => grupoNovo(c.id) === g).length, 8, g);
assert.equal(clubes.filter(c => grupoNovo(c.id) === "X").length, 14);
assert.deepEqual([31, 32, 33, 41, 42, 43].map(grupoNovo).filter(g => g === "X"), []); // os 3 primeiros de cada C sobem para a B
// serpentina: os mais fortes da B nova (ids 11, 12, 13, 15, 16, 17...) vão B, C, F, F, C, B
assert.deepEqual([11, 12, 13, 15, 16, 17, 18].map(grupoNovo), ["B", "C", "F", "F", "C", "B", "B"]);
assert.equal(t.destino[31], "subiu"); assert.equal(t.destino[34], "guardado"); assert.equal(t.destino[1], "campeão"); assert.equal(t.destino[11], "ficou");
assert.equal(t.lista.some(m => m.caiu), false); // ninguém cai
// sem dirigente ativo: os campeões das duas Bs
const s = movimentosDaTransicao({ clubes, grupos, forca, ativo: () => false });
assert.deepEqual(s.lista.filter(m => m.grupo === "A").map(m => m.clube_id).sort((a, b) => a - b), [11, 21]);

// temporada normal: A 12 (ids 1–12), B, C e F com 8; o vencedor do playoff de cada grupo (pela final de ida e volta) sobe
const g2 = { A: Array.from({ length: 12 }, (_, i) => ({ clube_id: i + 1, posicao: i + 1 })) }, c2 = g2.A.map(l => ({ id: l.clube_id, grupo: "A", divisao: 1 }));
const partidas = [], resultados = [];
for (const [k, g] of ["B", "C", "F"].entries()) {
  g2[g] = Array.from({ length: 8 }, (_, i) => ({ clube_id: 100 + 10 * k + i, posicao: i + 1 }));
  g2[g].forEach(l => c2.push({ id: l.clube_id, grupo: g, divisao: 2 }));
  const [m, p] = [g2[g][0].clube_id, g2[g][3].clube_id]; // final entre o 1º e o 4º; o 4º vence no agregado
  partidas.push({ id: partidas.length + 1, grupo: g, fase: "final", rodada: 18, casa: p, fora: m }, { id: partidas.length + 2, grupo: g, fase: "final", rodada: 19, casa: m, fora: p });
  resultados.push({ partida_id: partidas.length - 1, gols_casa: 2, gols_fora: 0 }, { partida_id: partidas.length, gols_casa: 1, gols_fora: 0 });
}
const n = movimentos({ rng: criarRng(7), clubes: c2, grupos: g2, partidas, resultados });
assert.deepEqual(n.lista.filter(m => m.grupo === "A").map(m => m.clube_id), [103, 113, 123]);
const caem = n.lista.filter(m => m.caiu);
assert.deepEqual(caem.map(m => m.clube_id).sort((a, b) => a - b), [10, 11, 12]);
assert.deepEqual(caem.map(m => m.grupo).sort(), ["B", "C", "F"]); // um para cada grupo que cedeu
assert.equal(n.destino[103], "subiu"); assert.equal(n.destino[100], "ficou"); assert.equal(n.destino[1], "campeão");
assert.throws(() => movimentos({ rng: criarRng(7), clubes: c2, grupos: g2, partidas: partidas.slice(2), resultados }), /Série B1/);
console.log("pirâmide ok");
