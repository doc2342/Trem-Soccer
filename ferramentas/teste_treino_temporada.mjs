import assert from "node:assert";
import { readFileSync } from "node:fs";
import { CONFIG_TREINO, fatorDaTemporada, pontosDaSessao, treinar } from "../src/treino.js";
import { gerarJogador } from "../src/gerador.js";
import { criarRng } from "../src/rng.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
assert.equal(CONFIG_TREINO.freio, undefined);
assert.equal(fatorDaTemporada(22), 1);
assert.ok(Math.abs(fatorDaTemporada(14) * 14 - 22) < 1e-9);   // a B soma o mesmo que a A
assert.ok(Math.abs(fatorDaTemporada(18) * 18 - 22) < 1e-9);   // país de 10 clubes
assert.equal(fatorDaTemporada(0), 1);
assert.equal(fatorDaTemporada(), 1);
// sem freio: o garoto de 16 anos adiantado treina o mesmo que um de 20 com a mesma nota e o mesmo teto
const j = gerarJogador(criarRng(1), { id: "x", pos: "MC", alvo: 22, idade: 16, nomes, usados: new Set() });
assert.equal(pontosDaSessao({ ...j, idade: 16 }, { tal: 80 }), pontosDaSessao({ ...j, idade: 20 }, { tal: 80 }));
// uma temporada da B (14 sessões com o fator) rende o mesmo que uma da A (22 sessões), com tolerância de arredondamento
const temporada = n => { let x = { ...j, at: j.at.slice(), pts: null }; for (let s = 0; s < n; s++) { const r = treinar(x, { tal: 80, fator: fatorDaTemporada(n) }); if (r) x = { ...x, ...r }; } return x.at.reduce((t, v) => t + v, 0); };
assert.ok(Math.abs(temporada(14) - temporada(22)) <= 2);
console.log("ok");
