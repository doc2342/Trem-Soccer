// Peso do elenco e chance do time fraco: o favorito por diferença de nível, os planos do azarão contra um time muito mais forte
// e os confrontos da retranca (que não pode virar a tática de todo mundo entre times iguais).
// Uso: node ferramentas/sim_zebra.mjs [jogos por linha] [CONFIG.chave=valor ...]   (chave com ponto para o que está dentro: contraAtaque.com=0.2)
// Metas: +6 o favorito perde 10% a 15%; o fraco com o melhor plano faz ~0,8 ponto por jogo contra o +6; retranca contra neutro equilibra.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze, gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js"; import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 2000;
for (const a of process.argv.slice(3)) { const [k, v] = a.replace(/^CONFIG\./, "").split("="), ks = k.split("."), o = ks.slice(0, -1).reduce((o, x) => o[x], CONFIG); o[ks.at(-1)] = +v; }
const NIVEL = 38, pc = v => (100 * v).toFixed(0) + "%", f2 = v => v.toFixed(2);
const onze = (s, nivel) => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel, nomes, prefixoId: "p" + s + "_" });
// A contra B em campo neutro, alternando quem é o mandante no papel (sem mando); devolve vitória, empate, pontos e gols do A
function jogar(difA, insA, insB, semente) {
  const rng = criarRng(semente); let v = 0, e = 0, g = 0;
  for (let n = 0; n < N; n++) {
    const a = prepararTime({ nome: "A", escalacao: onze(2000 + n % 30, NIVEL + difA), instrucoes: insA }), b = prepararTime({ nome: "B", escalacao: onze(1000 + n % 30, NIVEL), instrucoes: insB });
    const inv = n % 2, r = inv ? simularPartida(rng, b, a) : simularPartida(rng, a, b), ga = r.placar[inv], gb = r.placar[1 - inv];
    if (ga > gb) v++; else if (ga === gb) e++; g += ga + gb;
  }
  return { v: v / N, e: e / N, d: 1 - (v + e) / N, ppj: (3 * v + e) / N, gols: g / N };
}
console.log(`${N} jogos por linha${process.argv.length > 3 ? " · " + process.argv.slice(3).join(" ") : ""}`);
console.log("\nFavorito por diferença de nível (tática padrão nos dois)");
for (const d of [0, 2, 4, 6]) { const r = jogar(d, {}, {}, 10 + d); console.log(`  +${d}: vence ${pc(r.v)}  empata ${pc(r.e)}  perde ${pc(r.d)}  gols ${f2(r.gols)}`); }
const PLANOS = { "padrão": {}, "retranca": { mentalidade: -2 }, "retranca e contra": { mentalidade: -2, contraAtaque: true }, "fechado, agressivo e contra": { mentalidade: -1, agressividade: 2, contraAtaque: true, passe: "longo" }, "peito aberto": { mentalidade: 2, pressao: 2 } };
console.log("\nAzarão (-6) contra o forte de tática padrão: plano do azarão");
for (const [nome, ins] of Object.entries(PLANOS)) { const r = jogar(-6, ins, {}, 40); console.log(`  ${nome.padEnd(28)} vence ${pc(r.v)}  empata ${pc(r.e)}  pontos/jogo ${f2(r.ppj)}  gols ${f2(r.gols)}`); }
console.log("\nA resposta do forte (+6) à retranca e contra do azarão");
for (const [nome, ins] of Object.entries({ "padrão": {}, "trabalhar até a área": { finalizar: "area" }, "passe curto e área": { passe: "curto", finalizar: "area" }, "muito ofensivo": { mentalidade: 2 } })) {
  const r = jogar(6, ins, { mentalidade: -2, contraAtaque: true }, 70); console.log(`  ${nome.padEnd(28)} forte faz ${f2(r.ppj)} pontos/jogo  gols ${f2(r.gols)}`);
}
console.log("\nEntre iguais (meta: retranca equilibra, passe curto vence a retranca)");
for (const [nome, ia, ib] of [["retranca x neutro", { mentalidade: -2 }, {}], ["retranca e contra x neutro", { mentalidade: -2, contraAtaque: true }, {}], ["passe curto x retranca", { passe: "curto" }, { mentalidade: -2 }],
  ["muito ofensivo x neutro", { mentalidade: 2 }, {}], ["contra x muito ofensivo", { contraAtaque: true }, { mentalidade: 2 }]]) {
  const r = jogar(0, ia, ib, 90), pb = 3 * r.d + r.e; console.log(`  ${nome.padEnd(28)} ${f2(r.ppj)} x ${f2(pb)} (diferença ${(r.ppj - pb >= 0 ? "+" : "") + f2(r.ppj - pb)})  gols ${f2(r.gols)}`);
}
// liga de bots: a tática de bot muda a mentalidade conforme a força do adversário e o placar, então o ritmo mexe nos gols da liga (meta 2,7 a 3,3)
{ const rng = criarRng(123), el = s => gerarElenco(criarRng(s), { nivel: 33 + s % 9, nomes, prefixoId: "e" + s + "_" }), elencos = Array.from({ length: 20 }, (_, s) => el(s));
  let g = 0; const J = Math.ceil(N / 4);
  for (let n = 0; n < J; n++) {
    const ea = elencos[n % 20], eb = elencos[(n + 1 + n % 19) % 20], fa = taticaBot(ea).forca, fb = taticaBot(eb).forca;
    const ta = taticaBot(ea, { mandante: true, forcaAdversario: fb }), tb = taticaBot(eb, { forcaAdversario: fa });
    const r = simularPartida(rng, prepararTime({ nome: "A", ...ta, mandante: true }), prepararTime({ nome: "B", ...tb })); g += r.placar[0] + r.placar[1];
  }
  console.log(`\nLiga de bots (${J} jogos, elencos de nível 33 a 41): ${f2(g / J)} gols por jogo`); }
