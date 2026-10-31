// Grade 5×5 (src/grade.js): geometria, espelho, linha/lado antigos, nomes, soma em 9 zonas e Decisão.
// Uso: node ferramentas/teste_grade.mjs
import assert from "node:assert";
import { ZONAS_GRADE, faixaDe, corredorDe, colunaDe, espelhoGrade, linhaDaZona, ladoDaZona, ehGrade, vizinhas, nomeDaZona, paraNoveZonas, decisao } from "../src/grade.js";
import { IDX } from "../src/modelo.js";
import { ZONAS } from "../src/motor.js";

assert.strictEqual(ZONAS_GRADE.length, 25);
assert.deepStrictEqual([faixaDe("4d"), corredorDe("4d"), colunaDe("4d")], [4, "d", 3]);
assert.ok(ZONAS_GRADE.every(ehGrade) && !ZONAS.some(ehGrade));
assert.strictEqual(espelhoGrade("1E"), "5D"); assert.strictEqual(espelhoGrade("4d"), "2e"); assert.strictEqual(espelhoGrade("3C"), "3C");
for (const z of ZONAS_GRADE) assert.strictEqual(espelhoGrade(espelhoGrade(z)), z);
assert.deepStrictEqual(["1C", "2d", "3e", "4E", "5D"].map(linhaDaZona), ["D", "M", "M", "A", "A"]);
assert.deepStrictEqual(["MC", "AE", "DD"].map(linhaDaZona), ["M", "A", "D"]); // 9 zonas segue igual
assert.deepStrictEqual(["2e", "2C", "2D"].map(ladoDaZona), ["C", "C", "D"]);
assert.deepStrictEqual(["MC", "AE", "DD"].map(ladoDaZona), ["C", "E", "D"]);

assert.strictEqual(vizinhas("1E").length, 3); assert.strictEqual(vizinhas("3C").length, 8);
assert.deepStrictEqual(vizinhas("5D").sort(), ["4D", "4d", "5d"]);

assert.strictEqual(nomeDaZona("4C"), "a zona 14");
assert.strictEqual(nomeDaZona("4d"), "o meio-espaço direito na faixa do meia ofensivo");
assert.strictEqual(nomeDaZona("5E"), "o fundo pela esquerda");
assert.strictEqual(nomeDaZona("5C"), "a entrada da área");
assert.strictEqual(nomeDaZona("1D"), "a saída de bola pela direita");
assert.strictEqual(nomeDaZona("2C", "defesa"), "a zona 14"); // a faixa 2 de quem defende é a 4 de quem ataca
for (const z of ZONAS_GRADE) assert.ok(nomeDaZona(z) && !nomeDaZona(z).includes("meia-lua"), z);

const nove = paraNoveZonas(Object.fromEntries(ZONAS_GRADE.map(z => [z, 1])));
assert.deepStrictEqual(Object.keys(nove).sort(), ZONAS.slice().sort());
assert.strictEqual(Object.values(nove).reduce((a, b) => a + b, 0), 25); // soma conservada
assert.strictEqual(nove.MC, 2 * (1 + 1)); // faixas 2 e 3, centro + metade de cada meio-espaço
assert.strictEqual(nove.DE, 1.5);
const noveEstat = paraNoveZonas({ "4d": [2, 4], "4D": [1, 1] });
assert.deepStrictEqual(noveEstat, { AD: [2, 3], AC: [1, 2] }); // pares [ganhos, perdidos]

const at = new Array(Object.keys(IDX).length).fill(10); at[IDX.cri] = 16; at[IDX.equ] = 12;
assert.strictEqual(decisao(at), 14);

console.log("teste_grade: ok");
