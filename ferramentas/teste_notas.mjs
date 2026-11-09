// Nota da partida na régua do Sofascore (dono, 09/11): média perto de 7 e o defensor subindo com o resultado; a forma segue com a nota de antes.
// Uso: node ferramentas/teste_notas.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";
import { montarRelatorio, NOTA } from "../src/relatorio.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const todas = [], defesa = { cs: [], empate: [], goleada: [] };
for (let s = 1; s <= 300; s++) {
  const t = (k, m) => prepararTime({ nome: "T" + k, escalacao: gerarOnze(criarRng(s * 2 + k), FORMACOES[["4-2-3-1", "4-4-2"][k]], { nivel: 25 + (s * (37 + 16 * k)) % 11, nomes, prefixoId: "p" + s + k + "_" }).map(x => ({ j: x, pos: x.pos, ...x })), banco: [], instrucoes: {}, mandante: m, prevencao: 0 });
  const p = simularPartida(criarRng(s), t(0, true), t(1, false), { regrasT1: false });
  for (const j of montarRelatorio(p).jogadores) {
    assert.ok(j.notaForma >= 1 && j.notaForma <= 10 && j.nota >= 1 && j.nota <= 10);
    if (j.pos === "GK") assert.ok(Math.abs(j.nota - j.notaForma - NOTA.base.GK) < 0.11 || j.nota === 10, "o goleiro só muda pela base");
    if (j.minutos < 45) continue;
    todas.push(j.nota);
    if (NOTA.grupo[j.pos] !== "defesa") continue;
    const a = p.placar[j.time], b = p.placar[1 - j.time];
    if (a > b && b === 0) defesa.cs.push(j.nota); else if (a === b && b > 0) defesa.empate.push(j.nota); else if (b >= a + 3) defesa.goleada.push(j.nota);
  }
}
const media = l => l.reduce((s, x) => s + x, 0) / l.length, m = media(todas), d = Object.fromEntries(Object.entries(defesa).map(([k, l]) => [k, media(l)]));
console.log("média", m.toFixed(2), "| defensor: vitória sem sofrer", d.cs.toFixed(2), "empate", d.empate.toFixed(2), "goleada sofrida", d.goleada.toFixed(2));
assert.ok(m > 6.8 && m < 7.2, "média fora da régua");
assert.ok(d.cs > d.empate + 0.5 && d.empate > d.goleada + 0.3, "o defensor tem que subir com o resultado");
console.log("teste_notas: ok");
