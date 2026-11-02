// Telemetria do movimento 2D: mede um jogo pelas amostras gravadas, sem desenhar nada. Exporta medir() para o teste; rodar direto imprime a tabela.
// Uso: node prototipos/sim_movimento.mjs [jogos]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { COMPORTAMENTOS, gerarTrajetorias } from "./movimento.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
export function jogar(s, fa = "4-2-3-1", fb = "4-4-2") {
  const onze = (p, q, f) => gerarOnze(criarRng(q), FORMACOES[f], { nivel: 30, nomes, prefixoId: p, novos: true }), a = onze("a", 11 + s, fa), b = onze("b", 512 + s, fb), registro = [];
  const partida = simularPartida(criarRng(5 + s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { regrasT1: true, registro });
  return gerarTrajetorias(partida, registro, Object.fromEntries([...a, ...b].map(x => [x.j.id, x.j.at])));
}
// jogo corrido: fora das bolas paradas. Formação: distância de cada um ao lugar dele no desenho do time, depois de tirar o quanto o time inteiro andou
export function medir(tr) {
  const O = (tr.n + 1) * 4, D = tr.dados, X = (s, k) => D[s * O + k * 4], Y = (s, k) => D[s * O + k * 4 + 1], VX = (s, k) => D[s * O + k * 4 + 2], VY = (s, k) => D[s * O + k * 4 + 3], at = (s, k) => tr.ativo[s * tr.n + k];
  const linha = tr.pos.map((p, k) => k).filter(k => tr.pos[k] !== "GK"), m = { amostras: 0, centro: 0, perto: 0, cola2: 0, cola1: 0, pares: 0, vizinho: 0, parado: 0, andando: 0, vel: 0, comp: 0, alarg: 0, formacao: 0, viradas: 0, trocasAlvo: 0 }, cor = [0, 0, 0, 0, 0], ate = [14, 25, 43, 54, 68], estados = {}, velPos = {}, mediaXY = {};
  for (const k of linha) { let x = 0, y = 0, n = 0; for (let s = 60; s < tr.ns; s += 8) if (at(s, k)) { x += X(s, k) ; y += Y(s, k); n++; } mediaXY[k] = [x / n, y / n]; }
  const ultimaDir = {}, ultimoAlvo = {};
  for (let s = 60; s < tr.ns; s += 2) {
    if (tr.fases[s * 2] === 6) continue;
    m.amostras++; const bx = X(s, tr.n), by = Y(s, tr.n);
    for (const t of [0, 1]) {
      const ks = linha.filter(k => at(s, k) && tr.idTime[k] === t); let c = 0, p = 0, xa = 0, ya = 0, xm = 0, ym = 0, mn = 999, mx = -1, ymn = 99, ymx = -1;
      for (const k of ks) { const x = X(s, k), y = Y(s, k); if (y > 24 && y < 44) c++; if (Math.hypot(x - bx, y - by) < 15) p++; xa += x; ya += y; xm += mediaXY[k][0]; ym += mediaXY[k][1]; mn = Math.min(mn, x); mx = Math.max(mx, x); ymn = Math.min(ymn, y); ymx = Math.max(ymx, y); cor[ate.findIndex(v => y <= v)]++; }
      m.centro += c; m.perto += p; m.comp += mx - mn; m.alarg += ymx - ymn; xa /= ks.length; ya /= ks.length; xm /= ks.length; ym /= ks.length;
      for (const k of ks) m.formacao += Math.hypot(X(s, k) - xa - (mediaXY[k][0] - xm), Y(s, k) - ya - (mediaXY[k][1] - ym)) / ks.length;
      for (const a of ks) { let v = 99; for (const b of ks) if (a !== b) { const d = Math.hypot(X(s, a) - X(s, b), Y(s, a) - Y(s, b)); v = Math.min(v, d); if (a < b) { m.pares++; if (d < 2) m.cola2++; if (d < 1) m.cola1++; } } m.vizinho += v / ks.length; }
    }
    for (let k = 0; k < tr.n; k++) { if (!at(s, k)) continue; const v = Math.hypot(VX(s, k), VY(s, k)), n = COMPORTAMENTOS[tr.comp[s * tr.n + k]], p = tr.pos[k]; estados[n] = (estados[n] || 0) + 1; (velPos[p] ??= [0, 0])[0] += v; velPos[p][1]++;
      if (p === "GK") continue; m.vel += v; if (v < 0.5) m.parado++; else if (v < 2) m.andando++;
      if (v > 2) { const dir = Math.atan2(VY(s, k), VX(s, k)), u = ultimaDir[k]; if (u !== undefined) { const dd = Math.abs(Math.atan2(Math.sin(dir - u), Math.cos(dir - u))); if (dd > 2) m.viradas++; } ultimaDir[k] = dir; }
      if (tr.alvos) { const i = (s * tr.n + k) * 4, ax = tr.alvos[i], ay = tr.alvos[i + 1], u = ultimoAlvo[k]; if (u && Math.hypot(ax - u[0], ay - u[1]) > 4) m.trocasAlvo++; ultimoAlvo[k] = [ax, ay]; } }
  }
  const n = m.amostras, total = cor.reduce((a, b) => a + b, 0), jog = linha.length, min = n * tr.amostra * 2 / 60;
  return { centroPorTime: m.centro / n / 2, pertoDaBolaPorTime: m.perto / n / 2, coladosMenos2m: 100 * m.cola2 / m.pares, coladosMenos1m: 100 * m.cola1 / m.pares, vizinhoMetros: m.vizinho / n / 2, comprimento: m.comp / n / 2, largura: m.alarg / n / 2, foraDaFormacao: m.formacao / n / 2,
    velocidade: m.vel / n / jog, parado: 100 * m.parado / n / jog, andando: 100 * m.andando / n / jog, viradasPorMin: m.viradas / min / jog, trocasAlvoPorMin: m.trocasAlvo / min / jog, corredores: cor.map(c => +(100 * c / total).toFixed(1)), estados, velocidadePorPos: Object.fromEntries(Object.entries(velPos).map(([p, [s, q]]) => [p, +(s / q).toFixed(2)])) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const N = +process.argv[2] || 1;
  for (let s = 0; s < N; s++) { const r = medir(jogar(s)); console.log(JSON.stringify(r)); }
}
