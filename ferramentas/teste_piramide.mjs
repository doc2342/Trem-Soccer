// Confere o acesso e descenso: caem 3 da A, sobe o vencedor do playoff de cada grupo da B, um rebaixado para cada grupo que cedeu.
// Uso: node ferramentas/teste_piramide.mjs
import assert from "node:assert";
import { movimentos } from "../src/virada.js";
import { criarRng } from "../src/rng.js";

// temporada normal: A 12 (ids 1–12), B, C e D com 8; o vencedor do playoff de cada grupo (pela final de ida e volta) sobe
const g2 = { A: Array.from({ length: 12 }, (_, i) => ({ clube_id: i + 1, posicao: i + 1 })) }, c2 = g2.A.map(l => ({ id: l.clube_id, grupo: "A", divisao: 1 }));
const partidas = [], resultados = [];
for (const [k, g] of ["B", "C", "D"].entries()) {
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
assert.deepEqual(caem.map(m => m.grupo).sort(), ["B", "C", "D"]); // um para cada grupo que cedeu
assert.equal(n.destino[103], "subiu"); assert.equal(n.destino[100], "ficou"); assert.equal(n.destino[1], "campeão");
assert.throws(() => movimentos({ rng: criarRng(7), clubes: c2, grupos: g2, partidas: partidas.slice(2), resultados }), /Série B1/);
console.log("pirâmide ok");
