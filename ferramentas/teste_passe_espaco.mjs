// Passe no espaço (Tarefa 9b da grade 5×5): a bola na frente, em zona sem ninguém nosso, para quem chega da faixa de baixo.
// Acontece; sempre para a frente e para outro jogador; o time mais veloz ganha mais desses passes (mesmas sementes).
import assert from "node:assert";
import { onze } from "./sim_grade.mjs";
import { criarRng } from "../src/rng.js";
import { IDX } from "../src/modelo.js";
import { prepararTime, simularPartida } from "../src/motor.js";

const veloz = (esc, mais) => esc.map(x => x.pos === "GK" ? x : { ...x, j: { ...x.j, at: x.j.at.map((v, k) => k === IDX.vel ? Math.min(50, v + mais) : v) } });
const medir = mais => {
  const r = [0, 0]; let narrado = false;
  for (let s = 0; s < 400; s++) {
    const reg = [], a = prepararTime({ nome: "A", escalacao: veloz(onze(100 + s, "4-3-2-1 (árvore de Natal)"), mais) }), b = prepararTime({ nome: "B", escalacao: onze(200 + s, "4-4-2") });
    const p = simularPartida(criarRng(s), a, b, { registro: reg });
    r[0] += p.estat[0].grade.espaco[0]; r[1] += p.estat[0].grade.espaco[1];
    for (const x of reg) if (x[1] !== "fim" && x[8] === "espaco") {
      assert.ok(+x[2][0] > +x[1][0], `passe no espaço para a frente: ${x[1]} → ${x[2]}`);
      assert.notEqual(x[2], "4C", "a zona 14 vazia é passe entre linhas, não no espaço");
      assert.notEqual(x[4], x[5], "quem chega não é quem passa");
      assert.ok(!x[7], "não é condução");
    }
    narrado ||= p.narracao.some(l => / no espaço, /.test(l.texto));
  }
  return { r, narrado };
};
const base = medir(0), rapido = medir(15);
assert.ok(base.r[0] > 200, `passe no espaço acontece: ${base.r[0]} em 400 jogos`);
assert.ok(base.narrado, "a narração conta o passe no espaço");
const taxa = r => r[1] / r[0];
// pelos passes ganhos: quem vê a própria Velocidade tenta mais vezes e em bolas piores, então a taxa pura esconde o ganho (0,417 × 0,421)
assert.ok(rapido.r[1] > base.r[1], `mais veloz ganha mais: ${rapido.r[1]} x ${base.r[1]}`);
console.log(`teste_passe_espaco: ok (${base.r[0]} passes, ${(100 * taxa(base.r)).toFixed(1)}% certos; +15 de Velocidade ${(100 * taxa(rapido.r)).toFixed(1)}%)`);

// Passe entrelinhas (dono, 31/10): na faixa 4 por dentro sem ninguém nosso, alguém aparece (o 9 que recua ou quem chega); só em 4e/4C/4d
{
  let n = 0, recuou = false;
  for (let s = 0; s < 20; s++) {
    const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: onze(300 + s, "4-4-2") }), prepararTime({ nome: "B", escalacao: onze(400 + s, "4-2-3-1") }), { registro: reg });
    for (const x of reg) if (x[1] !== "fim" && x[8] === "entre") { n++; assert.ok(["4e", "4C", "4d"].includes(x[2]), `entrelinhas só na faixa 4 por dentro: ${x[2]}`); assert.notEqual(x[4], x[5]); }
    recuou ||= p.narracao.some(l => /recua entre as linhas e recebe de/.test(l.texto));
  }
  assert.ok(n >= 10, `o 4-4-2 joga entrelinhas: ${n} em 20 jogos`); // ~1 por jogo hoje (20 a 27), o teste só prova que existe; o volume vai à revisão das mecânicas
  assert.ok(recuou, "a narração conta o 9 que recua entre as linhas");
  console.log(`teste_passe_espaco: entrelinhas ok (${n} em 20 jogos do 4-4-2)`);
}
