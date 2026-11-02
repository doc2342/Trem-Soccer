// Passo 0 da Tarefa 12: o mapa médio de cada papel (mapaDoJogador) contra a mancha dele. O papel que não ocupa a mancha é erro de papel, não de calibragem.
// A faixa 1 tem muito mais passos que as outras, então a comparação justa é "esperado": em cada zona, o volume do time × a fatia do jogador nos pesos dali.
// Uso: node ferramentas/sim_mapas_papeis.mjs [jogos por formação] [formações, com vírgula]
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { mapaDoJogador } from "../src/relatorio.js";
import { papeisDaPosicao } from "../src/papeis.js";
import { ZONAS_GRADE, espelhoGrade } from "../src/grade.js";

const N = +process.argv[2] || 300, LISTA = (process.argv[3] || "4-2-3-1,4-3-3 com pontas,4-4-2,3-5-2 com alas").split(",");
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const total = {};
const soma = (a, m, f = 1) => { for (const z in m) a[z] = (a[z] || 0) + m[z] * f; };
const FAIXAS = [1, 2, 3, 4, 5], COR = { E: "E", e: "e", C: "C", d: "d", D: "D" };
for (const f of LISTA) for (let n = 0; n < N; n++) {
  const vagas = FORMACOES[f], a = gerarOnze(criarRng(40000 + n), vagas, { nivel: 30, nomes, prefixoId: "a" + n + "_", novos: true }), b = gerarOnze(criarRng(50000 + n), FORMACOES["4-2-3-1"], { nivel: 30, nomes, prefixoId: "b" + n + "_", novos: true });
  const esc = a.map(x => { const l = papeisDaPosicao(x.pos); return l.length ? { ...x, papel: l[n % l.length] } : x; }); // um papel por jogo: todos enfrentam os mesmos adversários
  const registro = [], casa = n % 2 === 0, ta = prepararTime({ nome: "A", escalacao: esc }), tb = prepararTime({ nome: "B", escalacao: b });
  const p = casa ? simularPartida(criarRng(n), ta, tb, { regrasT1: true, registro }) : simularPartida(criarRng(n), tb, ta, { regrasT1: true, registro });
  const eu = casa ? 0 : 1, vol = { com: {}, sem: {} };
  for (const x of registro) { if (x[1] === "fim") continue; if (x[0] === eu) { vol.com[x[1]] = (vol.com[x[1]] || 0) + 1; vol.com[x[2]] = (vol.com[x[2]] || 0) + 1; } else if (x[9]) { const z = espelhoGrade(x[2]); vol.sem[z] = (vol.sem[z] || 0) + 1; } }
  const fichas = esc.filter(x => x.pos !== "GK").map(x => ({ x, mancha: p.jogadores[x.j.id].mancha })).filter(y => y.mancha);
  const pesos = { com: {}, sem: {} };
  for (const { mancha } of fichas) for (const k of ["com", "sem"]) soma(pesos[k], mancha[k]);
  for (const { x, mancha } of fichas) {
    const chave = x.pos.replace(/L$/, "R") + (x.papel ? ":" + x.papel : ""), L = "EeCdD";
    const virar = m => x.pos.endsWith("L") ? Object.fromEntries(Object.entries(m).map(([z, v]) => [z[0] + L[4 - L.indexOf(z[1])], v])) : m; // o lado esquerdo no espelho do direito
    const m = mapaDoJogador(registro, x.j.id, eu, x.pos), t = total[chave] ??= { n: 0, com: {}, sem: {}, ecom: {}, esem: {} };
    t.n++; soma(t.com, virar(m.com)); soma(t.sem, virar(m.sem));
    for (const k of ["com", "sem"]) { const e = {}; for (const z in mancha[k]) e[z] = (vol[k][z] || 0) * mancha[k][z] / pesos[k][z]; soma(t["e" + k], virar(e)); }
  }
}
const pct = m => { const s = Object.values(m).reduce((a, b) => a + b, 0) || 1; return Object.fromEntries(Object.entries(m).map(([z, v]) => [z, v / s])); };
const acordo = (a, b) => 1 - 0.5 * ZONAS_GRADE.reduce((s, z) => s + Math.abs((a[z] || 0) - (b[z] || 0)), 0);
const por = (m, fn) => { const r = {}; for (const z in m) r[fn(z)] = (r[fn(z)] || 0) + m[z]; return r; };
const fx = m => FAIXAS.map(f => Math.round(100 * (por(m, z => z[0])[f] || 0))).join("/"), cr = m => "EeCdD".split("").map(c => Math.round(100 * (por(m, z => z[1])[c] || 0))).join("/");
console.log(`${N} jogos por formação (${LISTA.join(", ")}). acordo = 1 − metade da distância entre real e esperado (mancha × volume). faixas 1/2/3/4/5, corredores E/e/C/d/D (lado esquerdo no espelho).`);
for (const chave of Object.keys(total).sort()) {
  const t = total[chave];
  for (const k of ["com", "sem"]) {
    const a = pct(t[k]), e = pct(t["e" + k]), fora = ZONAS_GRADE.map(z => [z, (a[z] || 0) - (e[z] || 0)]).filter(x => Math.abs(x[1]) >= 0.05).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 5).map(([z, d]) => `${z} ${d > 0 ? "+" : ""}${Math.round(100 * d)}`);
    const acoes = Object.values(t[k]).reduce((x, y) => x + y, 0) / t.n;
    console.log(`${(k === "com" ? chave : "").padEnd(16)} ${k} ações ${acoes.toFixed(0).padStart(3)} acordo ${acordo(a, e).toFixed(2)}  faixas real ${fx(a)} esp ${fx(e)}  corr real ${cr(a)} esp ${cr(e)}  ${fora.join(", ")}`);
  }
}
