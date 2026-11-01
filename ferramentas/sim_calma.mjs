// Calma do time (Influência do capitão + Trabalho em equipe, Tarefa 12): a régua do 2 a 0 e o efeito do capitão e do time, mesmo onze dos dois lados.
// Régua (docs/superpowers/specs/2026-11-01-viradas-fontes.md): quem abre 2 a 0 vence ~90% e perde ~2,6%. Efeito pequeno.
// Uso: node ferramentas/sim_calma.mjs [jogos] [formação]
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const N = +process.argv[2] || 3000, f = process.argv[3] || "4-2-3-1";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onzes = Array.from({ length: 40 }, (_, s) => ["a", "b"].map(p => gerarOnze(criarRng(5000 + s), FORMACOES[f], { nivel: 30, nomes, prefixoId: p + s + "_", novos: true })));
const ajusta = (l, inf, equ) => l.map((x, k) => ({ ...x, j: { ...x.j, at: x.j.at.map((v, i) => i === IDX.inf ? (k === 5 ? inf : v) : i === IDX.equ ? equ : v) } }));
// o capitão é o titular 5 (instr.capitao); A com inf/equ dados, B médio. Devolve aproveitamento de A e a virada depois de sofrer o 1º gol
const medir = (inf, equ) => {
  let pts = 0, atras = 0, voltou = 0;
  for (let n = 0; n < N; n++) {
    const [a0, b0] = onzes[n % 40], a = ajusta(a0, inf, equ), b = ajusta(b0, 25, 25), casa = n % 2 === 0, ia = casa ? 0 : 1;
    const ta = prepararTime({ nome: "A", escalacao: a, instrucoes: { capitao: a[5].j.id } }), tb = prepararTime({ nome: "B", escalacao: b, instrucoes: { capitao: b[5].j.id } });
    const r = casa ? simularPartida(criarRng(77 + n), ta, tb, { regrasT1: true }) : simularPartida(criarRng(77 + n), tb, ta, { regrasT1: true });
    const pa = r.placar[ia], pb = r.placar[1 - ia], p1 = r.lances.find(l => l.resultado === "gol");
    pts += pa > pb ? 3 : pa === pb ? 1 : 0;
    if (p1 && p1.time !== ia) { atras++; if (pa >= pb) voltou++; }
  }
  return `${(pts / N).toFixed(3)} pts/jogo; saiu atrás ${atras}, buscou ${(100 * voltou / atras).toFixed(1)}%`;
};
for (const [nome, i, e] of [["capitão 25, time 25", 25, 25], ["capitão 45, time 25", 45, 25], ["capitão 8, time 25", 8, 25], ["capitão 25, time 32", 25, 32], ["capitão 25, time 18", 25, 18]]) console.log(nome.padEnd(22), medir(i, e));
// a régua do 2 a 0 e do 1 a 0, atributos sem mexer
const R = { "2": [0, 0, 0], "1": [0, 0, 0] }; let gols = 0, fim80 = 0;
for (let n = 0; n < N; n++) {
  const [a, b] = onzes[n % 40], r = simularPartida(criarRng(177 + n), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { regrasT1: true });
  const gs = r.lances.filter(l => l.resultado === "gol"); gols += r.placar[0] + r.placar[1];
  if (!gs.length) continue;
  const lider = gs[0].time, sal = r.placar[lider] - r.placar[1 - lider], k = sal > 0 ? 0 : sal === 0 ? 1 : 2; R["1"][k]++;
  if (gs.length > 1 && gs[1].time === lider) R["2"][k]++;
  fim80 += gs.filter(l => l.min >= 80).length;
}
for (const g of ["2", "1"]) { const [v, e, d] = R[g], t = v + e + d; console.log(`abre ${g} a 0 (${t}): vence ${(100 * v / t).toFixed(1)}%, empata ${(100 * e / t).toFixed(1)}%, perde ${(100 * d / t).toFixed(1)}%`); }
console.log(`gols por jogo ${(gols / N).toFixed(2)}; ${(100 * fim80 / gols).toFixed(1)}% depois dos 80`);
