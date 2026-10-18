// Ordem "com um a menos"/"com um a mais": só vale depois de uma expulsão, no minuto seguinte. Uso: node ferramentas/teste_um_a_menos.mjs
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = s => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel: 38, nomes, prefixoId: "p" + s + "_" });
const ordens = [{ min: 0, cond: "umAMenos", muda: { mentalidade: -2 } }, { min: 0, cond: "umAMais", muda: { mentalidade: 2 } }];
const rng = criarRng(3); let falhas = 0, menos = 0, mais = 0;
for (let n = 0; n < 1500; n++) {
  const p = simularPartida(rng, prepararTime({ nome: "A", escalacao: onze(n), instrucoes: { ordens } }), prepararTime({ nome: "B", escalacao: onze(n + 9000) }));
  const v = t => p.eventos.find(e => e.tipo === "vermelho" && e.time === t), o = p.ordens[0].ordens, va = v(0), vb = v(1);
  const conf = (ord, red, outro) => red && (!outro || outro.min > red.min) ? ord.aos === red.min + 1 || (red.min >= 90 && ord.aos == null) : ord.aos == null || (outro && ord.aos > outro.min);
  if (!conf(o[0], va, vb)) { falhas++; console.log("FALHA um a menos", n, va, o[0]); }
  if (!conf(o[1], vb, va)) { falhas++; console.log("FALHA um a mais", n, vb, o[1]); }
  menos += o[0].aos != null; mais += o[1].aos != null;
}
console.log(`ordem com um a menos disparou ${menos}x, com um a mais ${mais}x`);
console.log(falhas ? falhas + " FALHAS" : "tudo certo");
