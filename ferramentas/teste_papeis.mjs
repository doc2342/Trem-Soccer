// Papéis dos jogadores (etapa 2, laterais): definição dos papéis, mapas com e sem a bola (o esquerdo é o espelho), nota no papel e gasto.
// Uso: node ferramentas/teste_papeis.mjs
import assert from "node:assert";
import { PAPEIS, PAPEL_PADRAO, PAPEIS_DESDE, papeisDaPosicao, papelValido, mapasDoPapel, notaNoPapel, gastoDoPapel } from "../src/papeis.js";
import { ATRIBUTOS } from "../src/modelo.js";
import { COBERTURA } from "../src/motor.js";

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ""} ${a} != ${b}`);
const soma = o => Object.values(o).reduce((s, v) => s + v, 0);

assert.strictEqual(PAPEIS_DESDE, 1);
for (const [k, p] of Object.entries(PAPEIS)) {
  perto(soma(p.pesos), 100, `pesos de ${k}`);
  for (const [pos, m] of Object.entries(p.mapas)) { perto(soma(m.com), 1, `${k}@${pos} com`); perto(soma(m.sem), 1, `${k}@${pos} sem`); }
  assert.ok(p.nome && p.faz && p.custa, `textos de ${k}`);
}
assert.deepStrictEqual(PAPEL_PADRAO, { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador" });
assert.deepStrictEqual(papeisDaPosicao("DR"), ["fixo", "apoiador", "construtor", "invertido"]);
assert.deepStrictEqual(papeisDaPosicao("MC"), []);

// o padrão segue pelo caminho de hoje (COBERTURA da posição)
assert.strictEqual(mapasDoPapel("DR", "fixo"), null);
assert.strictEqual(mapasDoPapel("WBR", "apoiador"), null);
assert.strictEqual(mapasDoPapel("DR", null), null);
assert.strictEqual(mapasDoPapel("MC", "fixo"), null);
// direito como na ficha; esquerdo espelhado
assert.deepStrictEqual(mapasDoPapel("DR", "apoiador").com, { AD: 0.30, MD: 0.40, DC: 0.05, DD: 0.25 });
assert.deepStrictEqual(mapasDoPapel("DL", "apoiador").com, { AE: 0.30, ME: 0.40, DC: 0.05, DE: 0.25 });
assert.deepStrictEqual(mapasDoPapel("WBL", "invertido").sem, { MC: 0.15, ME: 0.4, DE: 0.45 });

assert.strictEqual(papelValido("DR", "invertido"), true);
assert.strictEqual(papelValido("MC", "fixo"), false);
assert.strictEqual(papelValido("DR", "xyz"), false);
assert.strictEqual(papelValido("DR", null), false);

// gasto relativo ao padrão da posição: sem escolha, nada muda
perto(gastoDoPapel("DR", "fixo"), 1);
perto(gastoDoPapel("DR", null), 1);
perto(gastoDoPapel("WBR", "apoiador"), 1);
perto(gastoDoPapel("DR", "apoiador"), 1.10 / 0.95);
perto(gastoDoPapel("WBR", "fixo"), 0.95 / 1.15);
perto(gastoDoPapel("DR", "invertido"), 1 / 0.95);
perto(gastoDoPapel("MC", "fixo"), 1);

// nota no papel: atributos todos 30, natural → 30; competente → 30 × 0,93
const j = { at: ATRIBUTOS.map(() => 30), pos: "DR", fam: { DR: "N", WBR: "C" } };
perto(notaNoPapel(j, "DR", "construtor"), 30);
perto(notaNoPapel(j, "WBR", "construtor"), 30 * 0.93);
// padrão com as duas fases só com as regras da T1 (comPadrao); sem elas, o motor usa a COBERTURA de sempre
assert.strictEqual(mapasDoPapel("WBR", null), null);
assert.strictEqual(mapasDoPapel("DR", "fixo"), null);
assert.strictEqual(mapasDoPapel("WBR", null, true).com.AD, 0.32);
assert.strictEqual(mapasDoPapel("WBL", "xyz", true).sem.DE, 0.45, "esquerdo espelhado, papel inválido cai no padrão");
assert.strictEqual(mapasDoPapel("DR", null, true), null, "o lateral Fixo padrão fica com a COBERTURA");
assert.strictEqual(mapasDoPapel("MC", null, true), null, "posição sem papéis");
// o ala Apoiador joga mais alto que o lateral Apoiador com e sem a bola (o terceiro zagueiro cobre)
const ala = mapasDoPapel("WBR", null, true), lat = mapasDoPapel("DR", "apoiador");
const naDefesa = m => Object.entries(m).filter(([z]) => z[0] === "D").reduce((t, [, w]) => t + w, 0);
assert.ok(ala.com.AD > lat.com.AD && naDefesa(ala.sem) < naDefesa(lat.sem));
// o ala Fixo vai mais à frente com a bola que o lateral Fixo (COBERTURA do DR, sem AD)
assert.ok(mapasDoPapel("WBR", "fixo").com.AD > (COBERTURA.DR.AD || 0));
console.log("teste_papeis: ok");
