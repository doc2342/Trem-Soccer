// Grade 5×5 no motor (Tarefa 3): força por zona na grade em recalcular/avaliarZonas. Sem a grade, nada muda; com ela, só chaves da grade, sem NaN.
// Uso: node ferramentas/teste_grade_motor.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { avaliarZonas, defesaNaTransicao, CONFIG } from "../src/motor.js";
import { ZONAS_GRADE } from "../src/grade.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (f, s, papeis = {}) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" }).map(x => papeis[x.pos] ? { ...x, papel: papeis[x.pos] } : x);
const hash = x => createHash("sha256").update(JSON.stringify(x)).digest("hex");

// sem a grade, igual a antes da Tarefa 3 (valor gravado no teste)
const AVALIAR_ANTES = "c070ddd3f385f569f2c4e04d6dff5d12b1a1d3b15159e798461e624b28be7a96";
assert.strictEqual(hash(avaliarZonas(onze("4-2-3-1", 7))), AVALIAR_ANTES, "avaliarZonas sem a grade mudou");

assert.strictEqual(CONFIG.grade, false);
assert.strictEqual(CONFIG.t1.grade, false); // a Tarefa 6 liga
const g = avaliarZonas(onze("4-2-3-1", 7), {}, { grade: true });
assert.strictEqual(CONFIG.grade, false); // a chave volta
assert.deepStrictEqual(Object.keys(g.atk).sort(), ZONAS_GRADE.slice().sort()); // nenhuma chave de 9 zonas sobra
assert.deepStrictEqual(Object.keys(g.def).sort(), ZONAS_GRADE.slice().sort());
assert.ok(Object.values(g.atk).concat(Object.values(g.def)).every(Number.isFinite));
// a zona 14 com a bola é mais forte no 4-2-3-1 (AMC) que no 4-4-2
assert.ok(g.atk["4C"] > avaliarZonas(onze("4-4-2", 7), {}, { grade: true }).atk["4C"]);
// toda formação pronta e uma escalação estranha (10 em campo, 3 SC, 2 AMC, sem lateral): tudo finito
for (const f of Object.keys(FORMACOES)) {
  const r = avaliarZonas(onze(f, 3), { pressao: 2, mentalidade: 2 }, { grade: true });
  assert.ok(Object.values(r.atk).concat(Object.values(r.def)).every(Number.isFinite), f);
}
const estranha = onze("4-4-2", 5).slice(0, 10).map((x, i) => ({ ...x, pos: ["GK", "DC", "DC", "DC", "MC", "AMC", "AMC", "SC", "SC", "SC"][i] }));
const e = avaliarZonas(estranha, {}, { grade: true });
assert.ok(Object.values(e.atk).concat(Object.values(e.def)).every(Number.isFinite));
// o papel do lateral muda a grade: o Apoiador tem mais ataque no lado da faixa 4–5 que o Fixo
const ap = avaliarZonas(onze("4-2-3-1", 7, { DR: "apoiador" }), {}, { grade: true }), fx = avaliarZonas(onze("4-2-3-1", 7, { DR: "fixo" }), {}, { grade: true });
assert.ok(ap.atk["5D"] > fx.atk["5D"]);
// transição na grade: só quem tem papel (o Fixo padrão do DR e as manchas das posições não entram), como nas 9 zonas
CONFIG.grade = true;
try {
  const semPapel = onze("4-4-2", 7), invertido = onze("4-4-2", 7, { DR: "invertido" });
  assert.deepStrictEqual(defesaNaTransicao(semPapel), avaliarZonas(semPapel, {}, { grade: true }).def);
  assert.ok(defesaNaTransicao(invertido)["2d"] > avaliarZonas(invertido, {}, { grade: true }).def["2d"]);
} finally { CONFIG.grade = false; }
// erro no meio da conta não deixa a grade ligada
assert.throws(() => avaliarZonas(null, {}, { grade: true }));
assert.strictEqual(CONFIG.grade, false);

console.log("teste_grade_motor: ok");
