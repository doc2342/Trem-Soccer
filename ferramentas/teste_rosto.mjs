// Rostos dos jogadores (src/rosto.js): nenhuma cor ou número inválido no SVG, e o mesmo jogador sempre com o mesmo rosto.
// Pegou em 04/11 a mistura de cores com "#000"/"#fff" (formato curto) saindo como NaN, que o navegador pinta de preto.
import assert from "node:assert";
import { rostoSVG, mistura } from "../src/rosto.js";

assert.strictEqual(mistura("#3a2518", "#000", 0), "#3a2518");
assert.strictEqual(mistura("#000000", "#fff", 1), "#ffffff");
const PAISES = ["Brasil", "Argentina", "Uruguai", "Colômbia", "Chile"];
for (let i = 0; i < 500; i++) {
  const j = { id: `t${i}`, pais: PAISES[i % 5], idade: 17 + i % 22 };
  for (const op of [{}, { lista: true }, { padrao: "listras", decote: "v" }]) {
    const s = rostoSVG(j, op);
    assert.ok(!/NaN|undefined/.test(s), `rosto de ${j.id} com valor inválido`);
  }
}
// o mesmo jogador, o mesmo rosto (o número de série dos ids muda; o resto é igual)
const sem = s => s.replace(/ro\d+/g, "ro");
assert.strictEqual(sem(rostoSVG({ id: 42, pais: "Brasil", idade: 25 })), sem(rostoSVG({ id: 42, pais: "Brasil", idade: 25 })));
console.log("ok");
