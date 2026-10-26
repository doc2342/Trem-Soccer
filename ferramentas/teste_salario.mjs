// Confere a curva do salário de mercado do reinício (src/economia.js, relatório docs/superpowers/specs/2026-10-24-calibragem-do-reinicio.md):
// 14% por ponto de nota, a nota 41 custa o mesmo da curva antiga (12%), jovem −20%, veterano −10%, e o craque cabe no teto da A.
// Uso: node ferramentas/teste_salario.mjs
import assert from "node:assert"; import { readFileSync } from "node:fs";
const imp = f => import(new URL("../src/" + f, import.meta.url));
const { criarRng } = await imp("rng.js"), { gerarJogador } = await imp("gerador.js"), { melhorPosicao } = await imp("modelo.js");
const E = await imp("economia.js");
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));

const antigo41 = 250 * Math.pow(1.12, 16); // a curva de antes do reinício, na nota 41
const esperado = (nota, idade) => antigo41 * Math.pow(1.14, nota - 41) * (idade <= 21 ? 0.8 : idade >= 31 ? 0.9 : 1);
const rng = criarRng(7);
for (let k = 0; k < 300; k++) {
  const idade = rng.int(17, 34), j = gerarJogador(rng, { id: null, pos: rng.pick(["GK", "DC", "MC", "FC"]), alvo: rng.int(20, 43), idade, nomes });
  const nota = melhorPosicao(j).nota, s = E.salarioDeMercado(j);
  assert.ok(Math.abs(s - Math.max(50, esperado(nota, idade))) <= 5, `nota ${nota}, ${idade} anos: ${s} (esperado ~${Math.round(esperado(nota, idade))})`);
}
// nota 41 adulta: o mesmo de hoje (1.535 na tabela do relatório); 40 ÷ 39 = 1,14; nota 41 com 20 anos = 0,8 do adulto
assert.ok(Math.abs(esperado(41, 25) - 1535) <= 5);
assert.ok(Math.abs(esperado(40, 25) / esperado(39, 25) - 1.14) < 0.005);
assert.ok(Math.abs(esperado(41, 20) / esperado(41, 25) - 0.8) < 1e-9);
// o craque cabe: 15% do teto da A ≥ salário da nota 43
assert.deepEqual(E.TETO_DE_FOLHA, { 1: 19000, 2: 15000 });
assert.ok(E.MAXIMO_INDIVIDUAL * E.TETO_DE_FOLHA[1] >= esperado(43, 25));
assert.equal(E.VENDAS_PELO_AGENTE, 6);
console.log("salário: ok");
