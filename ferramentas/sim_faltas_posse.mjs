// Faltas contra posse nas regras da T0 (V0, a liga): 20 times fixos (nível e instruções sorteados) em turno e returno, por temporada.
// Alvo (dados reais de 4 ligas em prototipos/, TeamRankings 2026, 05/11/2026): inclinação das faltas que o time faz por ponto de posse
// entre -0,05 e +0,05 (Série A -0,02, Premier +0,05, Bundesliga -0,05, Portugal -0,04); 22 faltas e ~4 amarelos por jogo.
// Uso: node ferramentas/sim_faltas_posse.mjs [temporadas=3] [t1] [CONFIG.chave=valor ...]   (t1: com as regras da T1)
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarElenco } from "../src/gerador.js"; import { taticaBot } from "../src/bot.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const args = process.argv.slice(2), T = +(args.find(a => /^\d+$/.test(a)) || 3);
for (const a of args.filter(a => a.startsWith("CONFIG."))) { const [k, v] = a.slice(7).split("="), c = k.split("."); let o = CONFIG; for (const x of c.slice(0, -1)) o = o[x]; o[c.at(-1)] = +v; }
const reta = pts => { const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const c = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0), vx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), vy = pts.reduce((s, p) => s + (p[1] - my) ** 2, 0);
  return { incl: c / vx, r: c / Math.sqrt(vx * vy) }; };
const tot = { jogos: 0, faltas: 0, amarelos: 0, vermelhos: 0, gols: 0, contras: 0, tipo: { duelo: 0, ataque: 0, pressao: 0, tatica: 0 } }, porTime = [], porJogo = [];
for (let s = 0; s < T; s++) {
  const rng = criarRng(500 + s), times = Array.from({ length: 20 }, (_, k) => {
    const t = taticaBot(gerarElenco(criarRng(1000 * s + k), { nivel: 28 + rng.int(0, 12), nomes, prefixoId: `t${s}_${k}_` }));
    return { ...t, instrucoes: { ...t.instrucoes, mentalidade: rng.int(-2, 2), passe: ["curto", "misto", "longo"][rng.int(0, 2)], pressao: rng.int(0, 2) } };
  });
  const acc = times.map(() => ({ n: 0, posse: 0, faltas: 0 }));
  for (let a = 0; a < 20; a++) for (let b = 0; b < 20; b++) if (a !== b) {
    const p = simularPartida(rng, prepararTime({ nome: "A", ...times[a] }), prepararTime({ nome: "B", ...times[b] }), { regrasT1: args.includes("t1") });
    tot.jogos++;
    p.estat.forEach((e, i) => { const k = i ? b : a; acc[k].n++; acc[k].posse += e.posse; acc[k].faltas += e.faltas; porJogo.push([e.posse, e.faltas]);
      tot.faltas += e.faltas; tot.amarelos += e.amarelos; tot.vermelhos += e.vermelhos; tot.gols += e.gols; tot.contras += e.contraAtaques;
      for (const t in tot.tipo) tot.tipo[t] += (e.faltasTipo || { duelo: e.faltas })[t] || 0; });
  }
  porTime.push(...acc.map(x => [x.posse / x.n, x.faltas / x.n]));
}
const f = x => (x / tot.jogos).toFixed(2), rt = reta(porTime), rj = reta(porJogo);
console.log(`${tot.jogos} jogos | faltas ${f(tot.faltas)} (duelo ${f(tot.tipo.duelo)}, ataque ${f(tot.tipo.ataque)}, pressão ${f(tot.tipo.pressao)}, tática ${f(tot.tipo.tatica)}) | amarelos ${f(tot.amarelos)} | vermelhos ${f(tot.vermelhos)} | gols ${f(tot.gols)} | contra-ataques ${f(tot.contras)}`);
console.log(`por time na temporada: inclinação ${rt.incl.toFixed(3)} falta por ponto de posse, r ${rt.r.toFixed(2)} | por jogo: inclinação ${rj.incl.toFixed(3)}, r ${rj.r.toFixed(2)}`);
const faixa = po => po < 40 ? "<40" : po < 45 ? "40-45" : po < 50 ? "45-50" : po < 55 ? "50-55" : po < 60 ? "55-60" : ">=60", g = {};
for (const [po, fa] of porJogo) { const x = g[faixa(po)] ||= [0, 0]; x[0]++; x[1] += fa; }
console.log("por jogo, faltas feitas por faixa de posse: " + ["<40", "40-45", "45-50", "50-55", "55-60", ">=60"].filter(k => g[k]).map(k => `${k} ${(g[k][1] / g[k][0]).toFixed(1)} (n ${g[k][0]})`).join(" · "));
