// Excentricidade (risco na escolha do passo) e calma do time (Influência do capitão + Trabalho em equipe): Tarefa 12, passo inicial.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = s => gerarOnze(criarRng(s), FORMACOES["4-2-3-1"], { nivel: 30, nomes, prefixoId: "p" + s + "_", novos: true });
const muda = (l, f) => l.map((x, k) => ({ ...x, j: { ...x.j, at: f(x.j.at.slice(), k) } }));
const com = (l, i, v) => muda(l, at => { at[i] = v; return at; });
const DIFICIL = new Set(["pular", "virada", "inversao"]);
// parte das opções difíceis nos passos de A, e o acerto delas
const medir = (exc, jogos = 60) => {
  let dif = 0, tot = 0, ganhos = 0;
  for (let s = 0; s < jogos; s++) {
    const registro = [], a = com(onze(100 + s), IDX.exc, exc), b = onze(300 + s);
    simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { regrasT1: true, registro });
    for (const p of registro) if (p[0] === 0 && p[1] !== "fim") { tot++; if (DIFICIL.has(p[3]) || p[7] || p[8]) { dif++; if (p[6]) ganhos++; } }
  }
  return { parte: dif / tot, acerto: ganhos / dif };
};
const ousado = medir(40), simples = medir(10);
assert.ok(ousado.parte > simples.parte + 0.02, `o excêntrico tenta mais o difícil: ${ousado.parte} x ${simples.parte}`);
// sobe o risco, nunca a qualidade: o acerto do difícil não sobe com a Excentricidade
assert.ok(ousado.acerto < simples.acerto + 0.02, `sem ganho de acerto: ${ousado.acerto} x ${simples.acerto}`);

// calma: o mesmo jogo muda com a Influência do capitão e com o Trabalho em equipe (nos dois sentidos), e sem sorteio a mais: mesma semente, mesmo resultado
const placar = (inf, equ, s) => {
  const a = muda(onze(500 + s), (at, k) => { if (k === 5) at[IDX.inf] = inf; at[IDX.equ] = equ; return at; }), b = onze(700 + s);
  const r = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: { capitao: a[5].j.id } }), prepararTime({ nome: "B", escalacao: b }), { regrasT1: true });
  return r.xg[0] - r.xg[1];
};
assert.strictEqual(placar(40, 25, 1), placar(40, 25, 1));
let forte = 0, fraco = 0;
for (let s = 0; s < 150; s++) { forte += placar(45, 25, s); fraco += placar(8, 25, s); }
assert.ok(forte > fraco, `capitão forte rende mais: ${forte} x ${fraco}`);
console.log("teste_ousadia_calma: ok", ousado, simples);
