// Trava da temporada 0 (grade 5x5, Tarefa 0): 20 jogos + 2 de mata-mata com prorrogação, hash do que o jogo produz.
// Sem as regras da T1 (T0), e com elas mas sem grade (T1 de 9 zonas), a mesma semente tem que dar o mesmo jogo de sempre.
// Uso: node ferramentas/teste_t0_intacta.mjs
import assert from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";

// 05/11/2026: faltas de quem tem a posse na T0 (a T0 muda de propósito); na T1 só entrou estat.faltasTipo (sem ele, o hash da T1 é o de antes, a66675…)
// 06/11/2026: só a narração mudou (cartão com a falta, quem afasta, chute para fora variado, "Ele", atq no evento); sem p.narracao, o hash é o mesmo de antes (bf1409…, 4ba4ca…)
const HASH_T0 = "d6af89fe184375b655f542dbea202e75bfe65bf908eecddb7c5e4289afd10bad";
const HASH_T1_SEM_GRADE = "e721fee7722fbb7929e2328f1269b19d570f1ab7466ea736a73a7db697097420";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const formacoes = Object.keys(FORMACOES);
const onze = (f, s, papeis = {}) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" }).map(x => papeis[x.pos] ? { ...x, papel: papeis[x.pos] } : x);
const papeisDe = s => s % 2 ? { DR: "apoiador", DL: "apoiador", MC: "criador" } : {};

const jogos = regrasT1 => {
  const ps = [];
  for (let s = 1; s <= 22; s++) {
    const a = onze(formacoes[s % formacoes.length], s, papeisDe(s)), b = onze(formacoes[(s * 5 + 3) % formacoes.length], s + 500);
    ps.push(simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { regrasT1, prorrogacao: s > 20 }));
  }
  return ps;
};
const hash = ps => createHash("sha256").update(JSON.stringify(ps.map(p => [p.placar, p.narracao, p.estat, p.jogadores]))).digest("hex");

CONFIG.t1.grade = false; // a T1 de 9 zonas
const h0 = hash(jogos(false)), h1 = hash(jogos(true));
CONFIG.t1.grade = true;
console.log("HASH_T0 =", h0, "\nHASH_T1_SEM_GRADE =", h1);
assert.strictEqual(h0, HASH_T0, "a temporada 0 mudou");
assert.strictEqual(h1, HASH_T1_SEM_GRADE, "a T1 com 9 zonas mudou");
console.log("teste_t0_intacta: ok");
