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
