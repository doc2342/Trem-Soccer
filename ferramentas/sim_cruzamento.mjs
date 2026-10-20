// Mede a instrução de cruzamento (misto, alto, rasteiro): pontos, gols e cruzamentos do time A contra B, e se o xG do cruzamento alto e do rasteiro bate com os gols.
// Uso: node ferramentas/sim_cruzamento.mjs [jogos por linha]. CFG='{"cruzamento":{...}}' troca os valores para teste.
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js"; import { gerarOnze } from "../src/gerador.js"; import { FORMACOES } from "../src/escalacao.js"; import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
Object.assign(CONFIG, JSON.parse(process.env.CFG || "{}"));
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url))), N = +process.argv[2] || 3000, f2 = v => v.toFixed(2);
// perfil do A: "aereo" (cabeceio e força +10, finalização e velocidade -6) ou "chao" (o contrário), em todos os jogadores de linha
const MUDA = { aereo: { cab: 10, for: 10, fin: -6, vel: -6 }, chao: { cab: -6, for: -6, fin: 10, vel: 10 } };
const onze = (s, perfil) => gerarOnze(criarRng(s), FORMACOES["4-4-2"], { nivel: 30, nomes, prefixoId: "p" + s + "_" })
  .map(x => perfil && x.pos !== "GK" ? { ...x, j: { ...x.j, at: x.j.at.map((v, k) => { const d = Object.entries(MUDA[perfil]).find(([a]) => IDX[a] === k); return d ? Math.max(1, Math.min(50, v + d[1])) : v; }) } } : x);
function medir(instA, perfil, instB = {}) {
  const rng = criarRng(7); let pts = 0, gols = 0, gc = 0; const t = { alto: [0, 0, 0], rasteiro: [0, 0, 0] }; // chutes, xG, gols
  for (let n = 0; n < N; n++) {
    const s = n % 40, a = prepararTime({ nome: "A", escalacao: onze(1000 + s, perfil), instrucoes: instA }), b = prepararTime({ nome: "B", escalacao: onze(2000 + s), instrucoes: instB });
    const inv = n % 2, r = inv ? simularPartida(rng, b, a) : simularPartida(rng, a, b), ia = inv ? 1 : 0, [ga, gb] = [r.placar[ia], r.placar[1 - ia]];
    pts += ga > gb ? 3 : ga === gb ? 1 : 0; gols += ga; gc += gb;
    for (const l of r.lances) if (l.time === ia && l.tipo === "cruzamento") { const q = t[/rasteiro/.test(l.texto) ? "rasteiro" : "alto"]; q[0]++; q[1] += l.xg; if (l.resultado === "gol") q[2]++; }
  }
  const tx = k => `${k} ${(t[k][0] / N).toFixed(1)}/jogo xG ${f2(t[k][1] / (t[k][0] || 1))} gols/xG ${f2(t[k][2] / (t[k][1] || 1))}`;
  return `${f2(pts / N)} pts | GP ${f2(gols / N)} GC ${f2(gc / N)} | ${tx("alto")} | ${tx("rasteiro")}`;
}
console.log(`CFG ${process.env.CFG || "-"}, ${N} jogos por linha (cruzamentos do time A)`);
for (const p of [null, "aereo", "chao"]) for (const c of ["misto", "alto", "rasteiro"]) console.log(`${(p || "comum").padEnd(6)} ${c.padEnd(8)}: ${medir({ cruzamento: c, lado: "lados" }, p)}`);
