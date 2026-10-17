// Matriz de formações: todas contra todas, onzes gerados de mesma nota, campo neutro (alternando mando). Uso: node ferramentas/sim_formacoes.mjs [jogos por confronto]
// Meta: nenhuma formação acima de ~1,50 pts/jogo na média (≈55% de aproveitamento) nem muito abaixo de 1,20.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, avaliarZonas, CONFIG } from "../src/motor.js";
Object.assign(CONFIG, JSON.parse(process.env.CFG || "{}")); // teste de ajuste: CFG='{"ajudaAoCentro":0.8}'
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 2000, PARES = 20;
const fs = Object.keys(FORMACOES), curto = f => f.split(" ")[0] + (f.includes("losango") ? " los" : f.includes("pontas") ? " pon" : f.includes("Dugout") ? " DO" : "");
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" });
const pts = {}, gols = {}, tab = {};
for (const a of fs) { pts[a] = 0; gols[a] = [0, 0]; tab[a] = {}; }
let semente = 1;
for (let i = 0; i < fs.length; i++) for (let k = i + 1; k < fs.length; k++) {
  const a = fs[i], b = fs[k], rng = criarRng(semente++); let pa = 0, pb = 0;
  for (let n = 0; n < N; n++) {
    const s = 1000 + n % PARES, ta = prepararTime({ nome: "A", escalacao: onze(a, s) }), tb = prepararTime({ nome: "B", escalacao: onze(b, s + 500) });
    const p = n % 2 ? simularPartida(rng, tb, ta) : simularPartida(rng, ta, tb), [ga, gb] = n % 2 ? [p.placar[1], p.placar[0]] : p.placar;
    pa += ga > gb ? 3 : ga === gb ? 1 : 0; pb += ga < gb ? 3 : ga === gb ? 1 : 0;
    gols[a][0] += ga; gols[a][1] += gb; gols[b][0] += gb; gols[b][1] += ga;
  }
  pts[a] += pa; pts[b] += pb; tab[a][b] = pa / N; tab[b][a] = pb / N;
}
const jogos = N * (fs.length - 1), f2 = v => v.toFixed(2), sd = Math.sqrt(fs.reduce((s, f) => s + (pts[f] / jogos - 1.37) ** 2, 0) / fs.length);
console.log(`${N} jogos por confronto, CFG ${process.env.CFG || "-"}, gols/jogo ${f2(fs.reduce((s, f) => s + gols[f][0], 0) * 2 / jogos / fs.length)}, desvio dos pts ${f2(sd)}\n`);
console.log("formação".padEnd(30) + "pts/j  GP/j  GC/j  pior confronto");
for (const f of [...fs].sort((x, y) => pts[y] - pts[x])) {
  const pior = Object.entries(tab[f]).filter(([o]) => o !== f).sort((x, y) => x[1] - y[1])[0];
  console.log(f.padEnd(30) + f2(pts[f] / jogos).padEnd(7) + f2(gols[f][0] / jogos).padEnd(6) + f2(gols[f][1] / jogos).padEnd(6) + `${curto(pior[0])} (${f2(pior[1])})`);
}
// cobertura por zona (média de 20 onzes), para o mini-mapa
const zonas = {};
for (const f of fs) { const soma = {}; for (let s = 0; s < 20; s++) { const z = avaliarZonas(onze(f, 2000 + s)); for (const t of ["atk", "def"]) for (const k in z[t]) soma[t + k] = (soma[t + k] || 0) + z[t][k] / 20; } zonas[f] = soma; }
if (process.argv[3] === "zonas") console.log(JSON.stringify(zonas));
