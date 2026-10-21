// Confere a regra do número da camisa (src/camisa.js): node ferramentas/teste_numeros_camisa.mjs
import assert from "node:assert/strict";
import { numerosDaCamisa } from "../src/camisa.js";
const t = (pos, banco = []) => numerosDaCamisa({ titulares: pos.map((p, i) => ({ nome: "t" + i, pos: p })), banco: banco.map((p, i) => ({ nome: "b" + i, pos: p })) });
// 4-4-2: goleiro 1, laterais 2 e 6, zagueiros 3 e 4, pontas de meio 7 e 11, meias 8 e 10, atacantes 9 e o primeiro livre; banco do 12
let m = t(["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "SC", "FC"], ["GK", "DC", "MC"]);
assert.deepEqual([...m.values()].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
assert.deepEqual(["t0", "t1", "t2", "t3", "t4", "t5", "t8", "t9", "b0"].map(k => m.get(k)), [1, 2, 3, 4, 6, 7, 11, 9, 12]);
// 4-3-3 com volante e meia: 5, 8, 10; pontas 7 e 11
m = t(["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "AMC", "RW", "LW", "SC"]);
assert.deepEqual(["t5", "t6", "t7", "t8", "t9", "t10"].map(k => m.get(k)), [5, 8, 10, 7, 11, 9]);
// três zagueiros e alas: ninguém repete
m = t(["GK", "DC", "DC", "DC", "WBR", "WBL", "MC", "MC", "AMC", "SC", "FC"]);
assert.equal(new Set(m.values()).size, 11);
assert.equal(numerosDaCamisa(null).size, 0);
console.log("números da camisa: ok");
