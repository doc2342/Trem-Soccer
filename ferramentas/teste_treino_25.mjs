// Treino com o vetor de 22 (T0, histórico) e o de 25 (T1): tamanho de at e pts sempre iguais, nenhum ponto em atributo que o jogador não tem.
// Uso: node ferramentas/teste_treino_25.mjs
import assert from "node:assert";
import { IDX, PESOS, POSICOES, ATR_MAX } from "../src/modelo.js";
import { AREA_DO_ATRIBUTO, FOCOS, focoAutomatico, focoDoJogador, partilha, treinar } from "../src/treino.js";

const base = { idade: 20, pos: "MC", fam: { MC: "N" } };
const j22 = { ...base, id: "j1", at: Array(22).fill(25) };
const j25 = { ...base, id: "j2", at: Array(25).fill(25) };

assert.strictEqual(AREA_DO_ATRIBUTO[IDX.plo], "mei");
assert.strictEqual(AREA_DO_ATRIBUTO[IDX.mov], "tat");
assert.strictEqual(AREA_DO_ATRIBUTO[IDX.dec], "tat");

// 22: igual ao de hoje, nenhum índice dos novos
const auto22 = (pos) => { // a conta de sempre, recalculada aqui
  const p = focoAutomatico(pos).p, f = new Set(FOCOS[p].at), pesos = PESOS[POSICOES[pos].papel];
  return Object.keys(pesos).filter(k => !f.has(k) && !["ref", "um", "enc"].includes(k) || pos === "GK" && !f.has(k)).sort((a, b) => pesos[b] - pesos[a]).slice(0, 3).map(k => IDX[k]);
};
assert.deepStrictEqual(focoAutomatico("MC", j22.at).c, auto22("MC"));
assert.deepStrictEqual(focoAutomatico("MC", j22.at), focoAutomatico("MC"));
assert.ok(Object.keys(partilha(j22)).every(i => +i < 22));
const r22 = treinar(j22, { tal: 80 });
assert.strictEqual(r22.at.length, 22);
assert.strictEqual(r22.pts.length, 22);
assert.ok(r22.pts.every(Number.isFinite));

// 25: at e pts com 25; pts antigo de 22 vira 25 sem perder valor
const r25 = treinar({ ...j25, pts: Array(22).fill(7) }, { tal: 80 });
assert.strictEqual(r25.at.length, 25);
assert.strictEqual(r25.pts.length, 25);
assert.ok(r25.pts.slice(0, 22).every(v => v >= 7), "ponto antigo não se perde");

// complementar automático de 25: maiores pesos da T1 fora do foco "meia", na ordem de declaração nos empates
assert.deepStrictEqual(focoAutomatico("MC", j25.at).c, [IDX.dec, IDX.plo, IDX.res]);
assert.deepStrictEqual(focoDoJogador(j25).c, [IDX.dec, IDX.plo, IDX.res]);
assert.ok(partilha(j25)[IDX.dec] > 0);

// foco salvo com índice novo: em 22 cai fora, em 25 vale; índice inválido e de goleiro continuam filtrados
const salvo = { p: "meia", c: [IDX.plo, IDX.res] };
assert.deepStrictEqual(focoDoJogador({ ...j22, treino: salvo }).c, [IDX.res]);
assert.deepStrictEqual(focoDoJogador({ ...j25, treino: salvo }).c, [IDX.plo, IDX.res]);
assert.ok(!(IDX.plo in partilha({ ...j22, treino: salvo })));
assert.deepStrictEqual(focoDoJogador({ ...j25, treino: { p: "meia", c: [40, IDX.ref, IDX.vel] } }).c, [IDX.vel]);
assert.deepStrictEqual(focoDoJogador({ ...j22, treino: { p: "meia", c: [IDX.dec] } }).c, focoAutomatico("MC").c); // só inválido: o automático
assert.ok(!Object.keys(partilha(j25)).map(Number).some(i => [IDX.ref, IDX.um, IDX.enc].includes(i)));

// foco salvo na T0 continua igual depois de o jogador ganhar os 3
const t0 = { p: "volante", c: [IDX.vel, IDX.res, IDX.equ] };
assert.deepStrictEqual(focoDoJogador({ ...j22, treino: t0 }), focoDoJogador({ ...j25, treino: t0 }));

// foco todo cheio: o rateio pelos pesos lê o vetor do jogador; com 22, nunca um ponto em índice 22 ou mais (seria NaN no banco)
const cheio = at => at.map((_, i) => FOCOS.meia.at.map(k => IDX[k]).includes(i) || [IDX.vel, IDX.res, IDX.equ].includes(i) ? ATR_MAX : 25);
const foco = { p: "meia", c: [IDX.vel, IDX.res, IDX.equ] };
const p22 = partilha({ ...j22, at: cheio(j22.at), treino: foco }), p25 = partilha({ ...j25, at: cheio(j25.at), treino: foco });
assert.ok(Object.keys(p22).every(i => +i < 22));
assert.ok(p25[IDX.dec] > 0 && p25[IDX.plo] > 0);
const r = treinar({ ...j22, at: cheio(j22.at), treino: foco }, { tal: 90 });
assert.ok(!r || r.at.every(Number.isFinite) && r.pts.length === 22);

console.log("ok");
