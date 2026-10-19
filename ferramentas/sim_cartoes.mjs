// Mede faltas e cartões por time e por jogo em cada nível de agressividade, e quantas expulsões são "baratas" (2º amarelo com só 2 faltas) ou cedo (até 45').
// Uso: node ferramentas/sim_cartoes.mjs [jogos por linha]
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js";
import { prepararTime, simularPartida } from "../src/motor.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 2000;
const guardados = {}, elenco = s => guardados[s] || (guardados[s] = taticaBot(gerarElenco(criarRng(s), { nivel: 34, nomes, prefixoId: "e" + s + "_" })));
console.log("agr | faltas | amarelos | vermelhos (2º am.) | baratas/100 jogos | até 45'   (por time e por jogo; o adversário joga em 0)");
for (const agressividade of [-2, -1, 0, 1, 2]) {
  const rng = criarRng(77), t = { faltas: 0, amarelos: 0, vermelhos: 0, segundo: 0, baratas: 0, cedo: 0 };
  for (let k = 0; k < N; k++) {
    const a = elenco(1 + k % 20), b = elenco(101 + k % 20), casa = k % 2;
    const ta = prepararTime({ nome: "A", escalacao: a.escalacao, banco: a.banco, instrucoes: { ...a.instrucoes, agressividade } }), tb = prepararTime({ nome: "B", escalacao: b.escalacao, banco: b.banco, instrucoes: { ...b.instrucoes, agressividade: 0 } });
    const p = casa ? simularPartida(rng, tb, ta) : simularPartida(rng, ta, tb), i = casa ? 1 : 0;
    t.faltas += p.estat[i].faltas; t.amarelos += p.estat[i].amarelos; t.vermelhos += p.estat[i].vermelhos;
    for (const j of Object.values(p.jogadores)) if (j.time === i && j.vermelho && j.amarelos >= 2) { t.segundo++; if (j.faltas <= 2) t.baratas++; if (j.saiu <= 45) t.cedo++; }
  }
  const f = x => (x / N).toFixed(2), pct = x => (t.segundo ? (100 * x / t.segundo).toFixed(0) : "0") + "%";
  console.log(`${agressividade >= 0 ? "+" : ""}${agressividade}  | ${f(t.faltas)} | ${f(t.amarelos)} | ${f(t.vermelhos)} (${f(t.segundo)}) | ${(100 * t.baratas / N).toFixed(1)} | ${pct(t.cedo)}`);
}
