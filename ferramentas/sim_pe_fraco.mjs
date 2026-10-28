// Pé fraco: a nota (1 a 20) muda os gols da liga? Quanto rende ter o pé ruim melhor ou pior que a média?
// Uso: node ferramentas/sim_pe_fraco.mjs [jogos por linha] [CONFIG.chave=valor ...]   (chave com ponto para o que está dentro: peFraco.tempo=0.15)
// Metas: "com a nota" igual a "sem a nota" em gols e xG (cada efeito tem compensação); pé fraco 1 perde pontos, 13+ ganha um pouco.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js"; import { fraquezaDoPe } from "../src/modelo.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 3000;
for (const a of process.argv.slice(3)) { const [k, v] = a.replace(/^CONFIG\./, "").split("="), ks = k.split("."), o = ks.slice(0, -1).reduce((o, x) => o[x], CONFIG); o[ks.at(-1)] = +v; }
const elencos = {}, elenco = s => elencos[s] || (elencos[s] = gerarElenco(criarRng(s), { nivel: 34, nomes, prefixoId: "e" + s + "_" }));
const todos = Array.from({ length: 40 }, (_, k) => elenco(1 + k)).flat();
console.log(`${N} jogos por linha${process.argv.length > 3 ? " · " + process.argv.slice(3).join(" ") : ""}`);
console.log(`  fraqueza média dos jogadores gerados ${(todos.reduce((s, j) => s + fraquezaDoPe(j.pf), 0) / todos.length).toFixed(3)} (CONFIG.peFraco.media = ${CONFIG.peFraco.media})`);
const comPf = (e, pf) => e.map(j => ({ ...j, pf: pf === undefined ? j.pf : pf }));
// A contra B, os dois do mesmo nível; muda: o que fazer com o pé fraco de A e de B e com as instruções de B
const linhas = [
  ["sem a nota (temporada 0)", e => comPf(e, null), e => comPf(e, null), {}],
  ["com a nota", e => e, e => e, {}],
  ["A pé fraco 1 x B normal", e => comPf(e, 1), e => e, {}],
  ["A pé fraco 12 x B normal", e => comPf(e, 12), e => e, {}],
  ["A pé fraco 1 x B pressão 2", e => comPf(e, 1), e => e, { pressao: 2 }],
  ["A normal x B pressão 2", e => e, e => e, { pressao: 2 }],
];
for (const [nome, fa, fb, instrB] of linhas) {
  const rng = criarRng(33), t = { pts: 0, gm: 0, gs: 0, xg: 0, gols: 0 };
  for (let k = 0; k < N; k++) {
    const a = taticaBot(fa(elenco(1 + k % 20))), b = taticaBot(fb(elenco(101 + k % 20))), casa = k % 2;
    const ta = prepararTime({ nome: "A", escalacao: a.escalacao, banco: a.banco, instrucoes: { ...a.instrucoes, ordens: [] } });
    const tb = prepararTime({ nome: "B", escalacao: b.escalacao, banco: b.banco, instrucoes: { ...b.instrucoes, ordens: [], ...instrB } });
    const p = casa ? simularPartida(rng, tb, ta) : simularPartida(rng, ta, tb), i = casa ? 1 : 0, g = p.placar;
    t.pts += g[i] > g[1 - i] ? 3 : g[i] === g[1 - i] ? 1 : 0; t.gm += g[i]; t.gs += g[1 - i]; t.gols += g[0] + g[1]; t.xg += p.xg[0] + p.xg[1];
  }
  const f = x => (x / N).toFixed(3);
  console.log(`  ${nome.padEnd(28)} gols/jogo ${f(t.gols)}  xG/jogo ${f(t.xg)}  | A: pontos/jogo ${f(t.pts)}  gols ${f(t.gm)} x ${f(t.gs)}`);
}
