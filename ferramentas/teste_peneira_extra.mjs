// O prêmio da diretoria de 95+ (153_premios_da_diretoria.sql) dá um garoto a mais na peneira: jovensDaBase com extra soma ao sorteio.
// Uso: node ferramentas/teste_peneira_extra.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { jovensDaBase } from "../src/base.js";
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
for (let s = 1; s <= 20; s++) {
  const base = { nivel: 3, momento: "peneira", nomes, temporada: 5, juvenis: true };
  const sem = jovensDaBase(criarRng(s), base).length, com = jovensDaBase(criarRng(s), { ...base, extra: 1 }).length;
  assert.strictEqual(com, sem + 1, `semente ${s}: ${sem} → ${com}`);
}
assert.strictEqual(jovensDaBase(criarRng(1), { nivel: 0, momento: "peneira", nomes, temporada: 5, extra: 1 }).length, 1, "base 0 com o prêmio revela 1");
console.log("peneira com o prêmio da diretoria: ok");
