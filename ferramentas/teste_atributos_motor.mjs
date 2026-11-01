// Passe longo, Movimentação e Decisões no motor (só na grade): jogador de 22 joga as regras da T1 sem NaN, com os mesmos valores que recebe na entrega.
// Uso: node ferramentas/teste_atributos_motor.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { IDX, comNovos } from "../src/modelo.js";
import { decisao, decisaoSobPressao, chegada } from "../src/grade.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const G = CONFIG.gradeValores;

// as contas
const at = new Array(25).fill(10); at[IDX.dec] = 33; at[IDX.vel] = 30; at[IDX.mov] = 20;
assert.strictEqual(decisao(at), 33);
assert.strictEqual(chegada(at), 25);
assert.strictEqual(decisaoSobPressao(20, 2, G), 14);
assert.strictEqual(decisaoSobPressao(40, 2, G), 38);
assert.strictEqual(decisaoSobPressao(27, 0, G), 27);
assert.strictEqual(G.reposicao.referencia, 19);

const onze = (f, s, novos = false) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_", novos });
const jogo = (a, b, s) => simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { regrasT1: true });
const semNaN = (v, onde = "") => {
  if (typeof v === "number") assert.ok(Number.isFinite(v), "número ruim em " + onde);
  else if (typeof v === "string") assert.ok(!/NaN|undefined/.test(v), v);
  else if (v && typeof v === "object") for (const k in v) semNaN(v[k], onde + "." + k);
};

// regras da T1 com todos de 22: nenhum NaN e j.at continua com 22
for (let s = 1; s <= 12; s++) {
  const a = onze("4-4-2", s), b = onze("4-3-3 com pontas", s + 100);
  const p = jogo(a, b, s);
  semNaN([p.placar, p.narracao, p.estat, p.jogadores], "jogo " + s);
  assert.ok([...a, ...b].every(x => x.j.at.length === 22), "o motor não pode gravar em j.at");
}

// o motor completa igual à entrega: a mesma semente com 22 e com os 3 já no vetor dá o mesmo jogo
for (let s = 1; s <= 8; s++) {
  const a = onze("4-4-2", s), b = onze("4-2-3-1", s + 100);
  const cheio = l => l.map(x => ({ ...x, j: { ...x.j, at: comNovos(x.j) } }));
  const p = jogo(a, b, s), q = jogo(cheio(a), cheio(b), s);
  assert.deepStrictEqual(q.placar, p.placar, "semente " + s);
  assert.deepStrictEqual(q.narracao, p.narracao, "semente " + s);
}

// +12 em Passe longo no time: mais bolas longas ganhas (nada mais muda nesse time)
const comPlo = l => l.map(x => { const at2 = comNovos(x.j).slice(); at2[IDX.plo] += 12; return { ...x, j: { ...x.j, at: at2 } }; });
const a = onze("4-4-2", 3, true), b = onze("4-4-2", 4, true), forte = comPlo(a);
const conta = time => { const t = [0, 0]; for (let s = 1; s <= 300; s++) { const g = jogo(time, b, s).estat[0].grade; t[0] += g.longas[0]; t[1] += g.longas[1]; } return t; };
const base = conta(a), mais = conta(forte);
console.log("bolas longas (lançadas, ganhas): base", base, "com +12 em plo", mais);
assert.ok(mais[1] > base[1], `bolas longas ganhas ${mais[1]} × ${base[1]}`);

console.log("ok");
