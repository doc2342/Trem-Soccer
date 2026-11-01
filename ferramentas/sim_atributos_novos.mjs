// Valor de Passe longo, Movimentação e Decisões: a linha inteira +6 num atributo, o mesmo onze contra ele mesmo, mando alternado, regras da T1 com a grade.
// Molde de sim_valor_posicao.mjs: mesma semente com e sem o reforço, saldo de xG a mais por jogo. +6 em Passe é a régua de comparação.
// Critério (plano dos atributos, Tarefa 7): Decisões rende na defesa e no volante; nenhum dos 3 dá zero em todas as linhas nem vale mais que +6 em Passe na mesma linha.
// Uso: node ferramentas/sim_atributos_novos.mjs [jogos por célula] [formação]
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const N = +process.argv[2] || 1500, formacao = process.argv[3] || "4-2-3-1", B = 6;
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const vagas = FORMACOES[formacao];
const LINHAS = [["goleiro", ["GK"]], ["defesa", ["DC", "SW", "DR", "DL", "WBR", "WBL"]], ["volante", ["DMC"]], ["meio", ["MC", "MR", "ML", "AMC", "AMR", "AML"]], ["ataque", ["RW", "LW", "FC", "SC"]]].filter(([, ps]) => vagas.some(p => ps.includes(p)));
const ATR = ["plo", "mov", "dec", "pas"];
const onzes = Array.from({ length: 40 }, (_, s) => ["a", "b"].map(p => gerarOnze(criarRng(5000 + s), vagas, { nivel: 30, nomes, prefixoId: p + s + "_", novos: true })));
const jogo = (n, a, b) => {
  const ta = prepararTime({ nome: "A", escalacao: a }), tb = prepararTime({ nome: "B", escalacao: b }), casa = n % 2 === 0;
  const { xg } = casa ? simularPartida(criarRng(77 + n), ta, tb, { regrasT1: true }) : simularPartida(criarRng(77 + n), tb, ta, { regrasT1: true });
  return casa ? xg : [xg[1], xg[0]];
};
const base = Array.from({ length: N }, (_, n) => jogo(n, ...onzes[n % 40]));
const valor = (k, ps) => {
  let pro = 0, contra = 0;
  for (let n = 0; n < N; n++) {
    const [a, b] = onzes[n % 40], forte = a.map(x => ps.includes(x.pos) ? { ...x, j: { ...x.j, at: x.j.at.map((v, i) => i === IDX[k] ? Math.min(50, v + B) : v) } } : x);
    const [f, c] = jogo(n, forte, b), [f0, c0] = base[n];
    pro += f - f0; contra += c0 - c;
  }
  return [(pro + contra) / N, pro / N, contra / N];
};
console.log(`${formacao}, ${N} jogos por célula: saldo de xG a mais por jogo com a linha +${B} no atributo (pró / contra)`);
console.log("linha".padEnd(10) + ATR.map(k => k.padEnd(24)).join(""));
const tabela = {};
for (const [nome, ps] of LINHAS) {
  const l = ATR.map(k => valor(k, ps)); tabela[nome] = l;
  console.log(nome.padEnd(10) + l.map(([s, p, c]) => `${s.toFixed(3)} (${p.toFixed(3)}/${c.toFixed(3)})`.padEnd(24)).join(""));
}
const col = i => Object.values(tabela).map(l => l[i][0]);
for (const i of [0, 1, 2]) console.log(`${ATR[i]}: ${col(i).every(v => Math.abs(v) < 0.005) ? "ZERO em todas as linhas" : "faz efeito"}; ${col(i).some((v, x) => v > Math.max(col(3)[x], 0) + 0.01) ? "vale mais que Passe em alguma linha" : "não passa do Passe"}`);
