// Confere o sorteio dos grupos da temporada 0 e a virada T0→T1.
// Uso: node ferramentas/teste_reinicio.mjs
import assert from "node:assert";
import { gruposDoReinicio } from "../src/virada.js";
import { criarRng } from "../src/rng.js";

// liga de hoje: A 12 donos; B 1, C 1 e F 4 donos; X 14 bots; mais 40 clubes de países
function liga(donos) {
  const clubes = []; let id = 1;
  for (let i = 0; i < donos; i++) clubes.push({ id: id++, grupo: i < 12 ? "A" : "F", dono: "d" + i });
  for (let i = 0; i < 50 - donos; i++) clubes.push({ id: id++, grupo: i < 14 ? "X" : "F", dono: null });
  for (let i = 0; i < 40; i++) clubes.push({ id: id++, grupo: ["ARG", "URU", "COL", "CHI"][i % 4], dono: null });
  return clubes;
}
const contar = (d, g) => Object.values(d).filter(x => x === g).length;
const donosEm = (clubes, d, g) => clubes.filter(c => c.dono && d[c.id] === g).length;

let clubes = liga(18), d = gruposDoReinicio({ rng: criarRng(3), clubes });
assert.equal(Object.keys(d).length, clubes.length);
assert.equal(contar(d, "A"), 12); assert.equal(clubes.filter(c => d[c.id] === "A" && c.dono).length, 0);
for (const g of ["B", "C", "D"]) { assert.equal(contar(d, g), 8); assert.equal(donosEm(clubes, d, g), 6); }
assert.equal(contar(d, "F"), 0); assert.equal(contar(d, "X"), 14);
clubes.filter(c => !["A", "F", "X"].includes(c.grupo) || c.id > 50).forEach(c => assert.equal(d[c.id], c.grupo));
assert.deepEqual(d, gruposDoReinicio({ rng: criarRng(3), clubes })); // mesma semente, mesmo sorteio

clubes = liga(19); d = gruposDoReinicio({ rng: criarRng(3), clubes });
for (const g of ["B", "C", "D"]) { assert.equal(contar(d, g), 8); assert.ok([6, 7].includes(donosEm(clubes, d, g))); }
assert.equal(contar(d, "E"), 0);

clubes = liga(26); d = gruposDoReinicio({ rng: criarRng(3), clubes });
for (const g of ["B", "C", "D", "E"]) assert.equal(contar(d, g), 8);
assert.equal(contar(d, "A"), 12); assert.equal(contar(d, "X"), 50 - 12 - 32);

assert.throws(() => gruposDoReinicio({ rng: criarRng(3), clubes: liga(30).filter(c => c.dono || c.id > 40) }), /Faltam \d+ clubes guardados para a B4/);
console.log("reinício ok");

// ---- virada T0→T1 ----
import { movimentosDoReinicio } from "../src/virada.js";
// A = bots 1–12; B, C e D com donos 101–106 / 201–206 / 301–306 e bots 107–108 / 207–208 / 307–308.
function t0() {
  const clubes = [], grupos = { A: [] }, partidas = [], resultados = [];
  for (let i = 1; i <= 12; i++) { clubes.push({ id: i, grupo: "A", divisao: 1 }); grupos.A.push({ clube_id: i, posicao: i, pontos: 40 - i }); }
  const semis = { B: [101, 102, 103, 107], C: [201, 202, 203, 204], D: [301, 302, 303, 304] };
  for (const [k, g] of ["B", "C", "D"].entries()) {
    grupos[g] = [];
    for (let i = 1; i <= 8; i++) {
      const id = 100 * (k + 1) + i, dono = i <= 6;
      clubes.push({ id, grupo: g, divisao: 2, dono }); grupos[g].push({ clube_id: id, posicao: i, pontos: 30 - i });
    }
    const [a, b, c, d] = semis[g];
    partidas.push({ id: partidas.length + 1, grupo: g, fase: "semi", casa: a, fora: d }, { id: partidas.length + 2, grupo: g, fase: "semi", casa: b, fora: c });
  }
  grupos.B.find(l => l.clube_id === 107).posicao = 3.5; // o bot 107 é semifinalista sem ser dono; 104 (dono) é o melhor fora das semis
  return { clubes, grupos, partidas, resultados };
}
const grupoFinal = (m, g) => m.lista.filter(x => x.grupo === g);
let { clubes: cl, grupos: gr, partidas: pa, resultados: re } = t0();
let m = movimentosDoReinicio({ clubes: cl, grupos: gr, partidas: pa, resultados: re, ativo: c => !!c.dono && c.id !== 304 });
assert.deepEqual(grupoFinal(m, "A").map(x => x.clube_id).sort((a, b) => a - b), [101, 102, 103, 104, 201, 202, 203, 204, 301, 302, 303, 305]);
assert.equal(m.lista.filter(x => x.caiu).length, 12);
const completo = g => gr[g].filter(l => !m.lista.some(x => x.clube_id === l.clube_id && !x.caiu)).length + grupoFinal(m, g).filter(x => x.caiu).length;
for (const g of ["B", "C", "D"]) assert.equal(completo(g), 8);
assert.equal(m.destino[1], "campeão"); assert.equal(m.destino[101], "subiu"); assert.equal(m.destino[2], "caiu"); assert.equal(m.destino[105], "ficou");
assert.deepEqual(m.lista.filter(x => x.caiu).map(x => x.grupo).slice(0, 4), ["B", "C", "D", "D"]); // serpentina

// só 10 donos ativos: sobem 10, os 2 bots melhor colocados da A ficam e caem 10
({ clubes: cl, grupos: gr, partidas: pa, resultados: re } = t0());
const ativos = new Set([101, 102, 103, 104, 201, 202, 203, 204, 301, 302]);
m = movimentosDoReinicio({ clubes: cl, grupos: gr, partidas: pa, resultados: re, ativo: c => ativos.has(c.id) });
assert.equal(grupoFinal(m, "A").length, 10); assert.equal(m.lista.filter(x => x.caiu).length, 10);
assert.equal(m.destino[2], "ficou"); assert.equal(m.destino[3], "caiu");
for (const g of ["B", "C", "D"]) assert.equal(completo(g), 8);
console.log("virada do reinício ok");
