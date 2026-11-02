// Passo 0 e 1b da Tarefa 12: o lateral fixo não carrega para fora da mancha, e o pivô forte segura e escora mais que o fraco.
// node ferramentas/teste_pivo_atrair.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (p, s) => gerarOnze(criarRng(s), FORMACOES["4-2-3-1"], { nivel: 30, nomes, prefixoId: p + s + "_", novos: true });
const com = (esc, pos, mud) => esc.map(x => pos.includes(x.pos) ? { ...x, j: { ...x.j, at: x.j.at.map((v, i) => Object.entries(mud).some(([k]) => IDX[k] === i) ? mud[Object.keys(mud).find(k => IDX[k] === i)] : v) } } : x);
const jogos = (mudar, N = 150) => {
  let escoras = 0, fora = 0, conduz = 0;
  for (let s = 0; s < N; s++) {
    const a = mudar(onze("a", 100 + s).map(x => x.pos === "DR" ? { ...x, papel: "fixo" } : x)), registro = [];
    const p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: onze("b", 500 + s) }), { regrasT1: true, registro });
    escoras += p.narracao.filter(l => l.texto.includes("escora para a passagem")).length;
    const dr = a.find(x => x.pos === "DR").j.id, m = p.jogadores[dr].mancha.com;
    for (const x of registro) if (x[0] === 0 && x[7] && x[4] === dr) { conduz++; if (!m[x[2]]) fora++; }
  }
  return { escoras, fora: fora / Math.max(1, conduz) };
};
const FRENTE = ["SC", "FC", "AMC", "AMR", "AML"], forte = jogos(e => com(e, FRENTE, { for: 44, dom: 44 })), fraco = jogos(e => com(e, FRENTE, { for: 12, dom: 12 })); // todos de frente: o pivô pode ser qualquer um que receba de costas
assert.ok(forte.escoras > 0 && forte.escoras > fraco.escoras, `o pivô forte escora mais: ${forte.escoras} x ${fraco.escoras}`);
assert.ok(forte.fora < 0.4, `o lateral fixo conduz dentro da mancha: ${(100 * forte.fora).toFixed(0)}% fora`);
console.log("teste_pivo_atrair: ok", forte, fraco);
