// Mede a instrução de finalização (misto, longe, area): pontos, chutes, xG e gols do time A contra B, em campo neutro (alternando mando).
// Uso: node ferramentas/sim_finalizar.mjs [jogos por linha]. CFG='{"finalizar":{...}}' troca os valores para teste.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js"; import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
Object.assign(CONFIG, JSON.parse(process.env.CFG || "{}"));
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 3000, f2 = v => v.toFixed(2);
// chutador: todos os jogadores de linha do A com Chute de longe +12
const onze = (s, chutador) => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel: 30, nomes, prefixoId: "p" + s + "_" }).map(x => chutador && x.pos !== "GK" ? { ...x, j: { ...x.j, at: x.j.at.map((v, k) => k === IDX.lon ? Math.min(50, v + 12) : v) } } : x);
function medir(instA, instB = {}, chutador = false) {
  const rng = criarRng(7); let pts = 0, gols = 0, gc = 0, fin = 0, xg = 0, esc = 0;
  for (let n = 0; n < N; n++) {
    const s = n % 40, a = prepararTime({ nome: "A", escalacao: onze(1000 + s, chutador), instrucoes: instA }), b = prepararTime({ nome: "B", escalacao: onze(2000 + s), instrucoes: instB });
    const inv = n % 2, r = inv ? simularPartida(rng, b, a) : simularPartida(rng, a, b), ia = inv ? 1 : 0, [ga, gb] = [r.placar[ia], r.placar[1 - ia]];
    pts += ga > gb ? 3 : ga === gb ? 1 : 0; gols += ga; gc += gb; fin += r.estat[ia].finalizacoes; xg += r.xg[ia]; esc += r.estat[ia].escanteios;
  }
  return `${f2(pts / N)} pts | GP ${f2(gols / N)} GC ${f2(gc / N)} | chutes ${(fin / N).toFixed(1)} xG/chute ${f2(xg / fin)} | escanteios ${(esc / N).toFixed(1)}`;
}
console.log(`CFG ${process.env.CFG || "-"}, ${N} jogos por linha`);
for (const f of ["misto", "longe", "area"]) console.log(`${f.padEnd(6)} x misto:          ${medir({ finalizar: f })}`);
for (const f of ["misto", "longe", "area"]) console.log(`${f.padEnd(6)} x retranca (-2):  ${medir({ finalizar: f }, { mentalidade: -2 })}`);
for (const f of ["misto", "longe", "area"]) console.log(`${f.padEnd(6)} com chutadores:   ${medir({ finalizar: f }, {}, true)}`);
for (const f of ["misto", "longe", "area"]) console.log(`${f.padEnd(6)} x ofensivo (+2):  ${medir({ finalizar: f }, { mentalidade: 2 })}`);
