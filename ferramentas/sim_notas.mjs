// Nota da partida por posição e por resultado (T0), contra a régua do Sofascore (src/relatorio.js, NOTA). Uso: node ferramentas/sim_notas.mjs [jogos]
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { montarRelatorio } from "../src/relatorio.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const forms = ["4-2-3-1", "4-4-2", "4-3-3", "3-5-2", "4-1-4-1"].filter(f => FORMACOES[f]);
const N = +process.argv[2] || 2000;
const GRUPO = { GK: "GK", DC: "ZAG", SW: "ZAG", DR: "LAT", DL: "LAT", WBR: "LAT", WBL: "LAT", DMC: "VOL", MC: "MC", MR: "MEI", ML: "MEI", AMC: "MEI", AMR: "PON", AML: "PON", RW: "PON", LW: "PON", FC: "ATA", SC: "ATA" };
const acc = {}, ad = (k, v) => { const a = acc[k] || (acc[k] = [0, 0]); a[0] += v; a[1]++; };
for (let s = 1; s <= N; s++) {
  const n0 = 25 + (s * 37 % 11), n1 = 25 + (s * 53 % 11);
  const t = (k, nivel, m) => prepararTime({ nome: "T" + k, escalacao: gerarOnze(criarRng(s * 2 + k), FORMACOES[forms[(s + k) % forms.length]], { nivel, nomes, prefixoId: "p" + s + k + "_" }).map(x => ({ j: x, pos: x.pos, ...x })), banco: [], instrucoes: {}, mandante: !k, prevencao: 0 });
  const p = simularPartida(criarRng(s), t(0, n0, true), t(1, n1, false), { regrasT1: false });
  const rel = montarRelatorio(p);
  for (const j of rel.jogadores) {
    if (j.minutos < 45) continue;
    const g = GRUPO[j.pos] || j.pos, pr = p.placar[j.time], co = p.placar[1 - j.time];
    const res = pr > co ? "V" : pr < co ? "D" : "E", lad = co === 0 ? (res === "V" ? "V-CS" : "0x0") : res === "V" ? "V-sof" : res === "E" ? "E-sof" : co <= 2 ? "D-1a2" : "D-3+";
    ad("all", j.nota); ad(g, j.nota); ad(g + " " + res, j.nota); ad(g + " " + lad, j.nota);
    if (j.notaForma != null) ad("forma " + g, j.notaForma);
  }
}
const f = k => acc[k] ? (acc[k][0] / acc[k][1]).toFixed(2) : "  -  ";
console.log("média geral", f("all"));
for (const g of ["GK", "ZAG", "LAT", "VOL", "MC", "MEI", "PON", "ATA"]) console.log(g.padEnd(4), f(g), "| V", f(g + " V"), "E", f(g + " E"), "D", f(g + " D"), "| V-CS", f(g + " V-CS"), "0x0", f(g + " 0x0"), "V-sof", f(g + " V-sof"), "E-sof", f(g + " E-sof"), "D-1a2", f(g + " D-1a2"), "D-3+", f(g + " D-3+"), "| n", acc[g] ? acc[g][1] : 0);
