// Mede o peso da energia no motor, com elencos gerados de mesma nota. Uso: node ferramentas/sim_energia.mjs [jogos por linha] [CONFIG.chave=valor ...]
// Cada linha: pontos do time A | gols A:B | gols do A menos os do B no 1º tempo e no 2º tempo.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js"; import { IDX } from "../src/modelo.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 3000;
for (const a of process.argv.slice(3)) { const [k, v] = a.split("="); CONFIG[k] = +v; }
const guardados = {}, elenco = s => guardados[s] || (guardados[s] = taticaBot(gerarElenco(criarRng(s), { nivel: 34, nomes, prefixoId: "e" + s + "_" })));
const comRes = d => a => ({ ...a, escalacao: a.escalacao.map(x => ({ ...x, j: { ...x.j, at: x.j.at.map((v, i) => i === IDX.res ? Math.max(1, Math.min(50, v + d)) : v) } })) });
function medir(instA, instB, opcoes = {}, mudaA = x => x) {
  const rng = criarRng(77); let pts = 0, ga_ = 0, gb_ = 0, t1 = 0;
  for (let k = 0; k < N; k++) {
    const a = mudaA(elenco(1 + k % 20)), b = elenco(101 + k % 20);
    const ta = prepararTime({ nome: "A", escalacao: a.escalacao, banco: a.banco, instrucoes: { ...a.instrucoes, ...instA } }), tb = prepararTime({ nome: "B", escalacao: b.escalacao, banco: b.banco, instrucoes: { ...b.instrucoes, ...instB } });
    const inv = k % 2, p = inv ? simularPartida(rng, tb, ta, opcoes) : simularPartida(rng, ta, tb, opcoes), s = inv ? -1 : 1;
    const [ga, gb] = inv ? [p.placar[1], p.placar[0]] : p.placar;
    for (const l of p.lances) if (l.resultado === "gol" && l.min <= 45) t1 += (l.time === (inv ? 1 : 0) ? 1 : -1);
    pts += ga > gb ? 3 : ga === gb ? 1 : 0; ga_ += ga; gb_ += gb;
  }
  const saldo = (ga_ - gb_) / N;
  return `${(pts / N).toFixed(2)} pts | gols ${(ga_ / N).toFixed(2)}:${(gb_ / N).toFixed(2)} | saldo 1ºT ${(t1 / N).toFixed(2)}, 2ºT ${(saldo - t1 / N).toFixed(2)}`;
}
const P = { pressao: 2 }, linha = (nome, ...a) => console.log(nome.padEnd(34), medir(...a));
linha("misto x misto", {}, {});
linha("pressão alta x misto", P, {});
linha("pressão média x misto", { pressao: 1 }, {});
linha("pressão alta x passe curto", P, { passe: "curto" });
linha("pressão alta x bola longa", P, { passe: "longo" });
linha("sem substituições x com", { substituicoes: [] }, {});
linha("pressão alta sem substituições", { ...P, substituicoes: [] }, {});
linha("Resistência +10 x normal", {}, {}, {}, comRes(10));
linha("Resistência -10 x normal", {}, {}, {}, comRes(-10));
linha("calor: misto x misto", {}, {}, { calor: true });
linha("calor: pressão alta x misto", P, {}, { calor: true });
