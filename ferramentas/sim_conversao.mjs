// Conversão dos chutes no alvo, por tipo e por faixa de xG, e quantas vezes um time faz gol em todo chute no alvo.
// Uso: node ferramentas/sim_conversao.mjs [jogos] [CONFIG.chave=valor …]
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
import { somar, imprimir } from "./origem_gols.mjs";
for (const a of process.argv.slice(3)) { const [k, v] = a.split("="), c = k.replace(/^CONFIG\./, "").split("."); let o = CONFIG; while (c.length > 1) o = o[c.shift()]; o[c[0]] = +v; }
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 5000;
const rng = criarRng(11), tipos = {}, faixas = {}, pct = (a, b) => (100 * a / b).toFixed(1);
const origens = {};
let esc = 0, fal = 0, tm = 0, g = 0, ng = 0, todos = 0, todos3 = 0, quatroEmQuatro = 0;
for (let n = 0; n < N; n++) {
  const nv = [26 + (n % 9), 26 + ((n * 7) % 9)];
  const t = nv.map((nivel, k) => prepararTime({ nome: "T" + k, escalacao: gerarOnze(criarRng(n * 2 + k), FORMACOES["4-4-2"], { nivel, nomes, prefixoId: `p${n}_${k}_` }), instrucoes: {} }));
  const r = simularPartida(rng, t[0], t[1]);
  for (const e of r.estat) { tm++; esc += e.escanteios; fal += e.faltas; g += e.gols; ng += e.noGol; if (e.noGol && e.gols >= e.noGol) { todos++; if (e.noGol >= 3) todos3++; if (e.noGol >= 4) quatroEmQuatro++; } }
  for (const d of r.lances) {
    somar(origens, d);
    if (!d.resultado) continue;
    const x = tipos[d.tipo] ||= { n: 0, xg: 0, alvo: 0, gol: 0, bl: 0 }, f = faixas[d.xg < 0.05 ? "<0,05" : d.xg < 0.1 ? "0,05–0,10" : d.xg < 0.2 ? "0,10–0,20" : d.xg < 0.35 ? "0,20–0,35" : "≥0,35"] ||= { n: 0, alvo: 0, gol: 0, xg: 0 };
    for (const o of [x, f]) { o.n++; o.xg += d.xg; if (d.resultado === "gol" || d.resultado === "defesa") o.alvo++; if (d.resultado === "gol") o.gol++; }
    if (d.resultado === "bloqueado") x.bl++;
  }
}
console.log(`${N} jogos: gols ${(g / tm).toFixed(2)} | no alvo ${(ng / tm).toFixed(2)} | conversão no alvo ${pct(g, ng)}%`);
console.log(`gol em todo chute no alvo: ${pct(todos, tm)}% dos times-jogo | com 3+ no alvo ${pct(todos3, tm)}% | com 4+ ${pct(quatroEmQuatro, tm)}%`);
console.log("tipo          chutes   xG/ch  bloq%  alvo%  gol/alvo%  gols/xG");
for (const [k, t] of Object.entries(tipos).sort((a, b) => b[1].n - a[1].n)) console.log(`${k.padEnd(13)} ${String(t.n).padStart(6)}  ${(t.xg / t.n).toFixed(3)}  ${pct(t.bl, t.n).padStart(5)}  ${pct(t.alvo, t.n).padStart(5)}  ${pct(t.gol, t.alvo).padStart(8)}  ${(t.gol / t.xg).toFixed(2)}`);
console.log("faixa de xG   chutes  alvo%  gol/alvo%  gols/xG");
for (const k of ["<0,05", "0,05–0,10", "0,10–0,20", "0,20–0,35", "≥0,35"]) { const f = faixas[k]; if (f) console.log(`${k.padEnd(12)} ${String(f.n).padStart(6)}  ${pct(f.alvo, f.n).padStart(5)}  ${pct(f.gol, f.alvo).padStart(8)}  ${(f.gol / f.xg).toFixed(2)}`); }
imprimir(origens, N, esc, fal);
