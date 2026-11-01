// Régua da grade (Tarefa 10): o acerto geral de passe que o sim_grade imprime (estat.grade.passos) bate com o registro passo a passo de 10 jogos,
// e o registro não muda o jogo (mesma semente, mesmo placar e mesma narração com e sem ele).
import assert from "node:assert";
import { jogar, onze } from "./sim_grade.mjs";
import { criarRng } from "../src/rng.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const t = jogar(10);
assert.equal(t.jogos, 10);
// do registro: passes (todos os tipos, a bola longa conta como pular) + conduções, [tentados, certos]
const doRegistro = [0, 0];
for (const k in t.tipo) { doRegistro[0] += t.tipo[k][0]; doRegistro[1] += t.tipo[k][1]; }
assert.ok(doRegistro[0] > 500, `poucos passos no registro: ${doRegistro[0]}`);
// num jogo: o registro bate com estat.grade (passos + conduções) e com os ataques
const reg = [], a = prepararTime({ nome: "A", escalacao: onze(1, "4-2-3-1"), instrucoes: {} });
const b = prepararTime({ nome: "B", escalacao: onze(2, "4-4-2"), instrucoes: {} });
const p = simularPartida(criarRng(3), a, b, { registro: reg }), sem = simularPartida(criarRng(3), a, b);
assert.deepEqual(p.placar, sem.placar); assert.equal(JSON.stringify(p.narracao), JSON.stringify(sem.narracao));
for (const i of [0, 1]) {
  const g = p.estat[i].grade, passos = reg.filter(r => r[0] === i && r[1] !== "fim");
  const tent = Object.values(g.passos).reduce((s, x) => s + x[0], 0) + g.conducoes[0], cert = Object.values(g.passos).reduce((s, x) => s + x[1], 0) + g.conducoes[1];
  assert.equal(passos.length, tent, `time ${i}: tentados`); assert.equal(passos.filter(r => r[6]).length, cert, `time ${i}: certos`);
  assert.equal(reg.filter(r => r[0] === i && r[1] === "fim").length, p.estat[i].ataques, `time ${i}: um fim por ataque`);
}
// o acerto impresso (estat.grade.passos, sem as conduções) = os passes do registro
assert.deepEqual(t.estatPassos, doRegistro);
console.log(`ok: ${doRegistro[0]} passes no registro, acerto impresso ${(100 * t.estatPassos[1] / t.estatPassos[0]).toFixed(1)}%`);
