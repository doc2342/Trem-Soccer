// Valor de cada posição: um titular +6 em todos os atributos, o mesmo onze contra ele mesmo, mando alternado; quanto o saldo de gols por jogo muda.
// Meta aprovada em 29/10 (plano dos papéis, Calibragem geral): defesa e volante valendo cerca de 70% do ataque.
// Uso: node ferramentas/sim_valor_posicao.mjs [jogos por posição] [formação] — mostra a temporada 0 (sem as regras da T1) e a T1 lado a lado
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const N = +process.argv[2] || 2000, formacao = process.argv[3] || "4-2-3-1", B = 6;
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const vagas = FORMACOES[formacao];
const saldo = (k, regrasT1) => {
  const rng = criarRng(99); let s = 0;
  for (let n = 0; n < N; n++) {
    const sem = 5000 + n % 40, a = gerarOnze(criarRng(sem), vagas, { nivel: 30, nomes, prefixoId: "a" + sem + "_" }), b = gerarOnze(criarRng(sem), vagas, { nivel: 30, nomes, prefixoId: "b" + sem + "_" });
    const forte = a.map((x, i) => i === k ? { ...x, j: { ...x.j, at: x.j.at.map(v => Math.min(50, v + B)) } } : x);
    const ta = prepararTime({ nome: "A", escalacao: forte }), tb = prepararTime({ nome: "B", escalacao: b }), casa = n % 2 === 0;
    const p = casa ? simularPartida(rng, ta, tb, { regrasT1 }) : simularPartida(rng, tb, ta, { regrasT1 });
    s += casa ? p.placar[0] - p.placar[1] : p.placar[1] - p.placar[0];
  }
  return s / N;
};
console.log(`${formacao}, ${N} jogos por posição: saldo a mais por jogo com o titular +${B} em tudo`);
console.log("posição  T0      T1");
const linhas = vagas.map((pos, k) => pos === "GK" ? null : [pos, saldo(k, false), saldo(k, true)]).filter(Boolean);
for (const [pos, a, b] of linhas) console.log(pos.padEnd(9) + a.toFixed(3).padEnd(8) + b.toFixed(3));
const media = (l, i) => l.reduce((s, x) => s + x[i], 0) / l.length;
const grupo = ps => linhas.filter(l => ps.includes(l[0]));
const ataque = grupo(["SC", "FC", "RW", "LW", "AMR", "AML"]), defesa = grupo(["DC", "DR", "DL", "WBR", "WBL", "SW"]), volante = grupo(["DMC"]);
for (const [nome, g] of [["defesa", defesa], ["volante", volante]]) if (g.length && ataque.length)
  console.log(`${nome} / ataque: T0 ${(100 * media(g, 1) / media(ataque, 1)).toFixed(0)}%  T1 ${(100 * media(g, 2) / media(ataque, 2)).toFixed(0)}%`);
