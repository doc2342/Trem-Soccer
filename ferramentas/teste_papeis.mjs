// Papéis dos jogadores (etapa 2, laterais): definição dos papéis, mapas com e sem a bola (o esquerdo é o espelho), nota no papel e gasto.
// Uso: node ferramentas/teste_papeis.mjs
import assert from "node:assert";
import { PAPEIS, PAPEL_PADRAO, PAPEIS_DESDE, papeisDaPosicao, papelValido, mapasDoPapel, manchaDoPapel, notaNoPapel, gastoDoPapel } from "../src/papeis.js";
import { ATRIBUTOS } from "../src/modelo.js";
import { COBERTURA } from "../src/motor.js";
import { ZONAS_GRADE, espelharGrade, MANCHAS, preferenciaDoPasso } from "../src/grade.js";

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ""} ${a} != ${b}`);
const soma = o => Object.values(o).reduce((s, v) => s + v, 0);

assert.strictEqual(PAPEIS_DESDE, 1);
for (const [k, p] of Object.entries(PAPEIS)) {
  perto(soma(p.pesos), 100, `pesos de ${k}`);
  for (const [pos, m] of Object.entries(p.mapas || {})) { perto(soma(m.com), 1, `${k}@${pos} com`); perto(soma(m.sem), 1, `${k}@${pos} sem`); }
  assert.ok(p.nome && p.faz && p.custa, `textos de ${k}`);
}
assert.deepStrictEqual(PAPEL_PADRAO, { DR: "fixo", DL: "fixo", WBR: "apoiador", WBL: "apoiador", SC: "matador", FC: "flutuante", DC: "xerife", DMC: "primeirovolante", MC: "organizador", AMC: "criador", RW: "agudo", LW: "agudo", AMR: "condutor", AML: "condutor", MR: "garcom", ML: "garcom" });
assert.deepStrictEqual(papeisDaPosicao("DR"), ["fixo", "apoiador", "construtor", "invertido"]);
assert.deepStrictEqual(papeisDaPosicao("DMC"), ["primeirovolante", "distribuidor", "boxtobox", "ladrao"]);
assert.deepStrictEqual(papeisDaPosicao("DC"), ["xerife", "tecnico", "combativo", "libero"]);

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
perto(gastoDoPapel("DR", "invertido"), 1.05 / 0.95);
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
// mapas na grade 5×5: todo papel tem mapa de DR e WBR que soma 1; o esquerdo é o espelho
for (const [k, p] of Object.entries(PAPEIS)) if (p.grade) for (const pos of Object.keys(p.grade)) for (const f of ["com", "sem"]) {
  perto(soma(p.grade[pos][f]), 1, k + " " + pos + " " + f);
  assert.ok(Object.keys(p.grade[pos][f]).every(z => ZONAS_GRADE.includes(z)), k + " " + pos);
}
const g = (pos, papel) => mapasDoPapel(pos, papel, true, true);
assert.ok(g("DR", "apoiador").com["4D"] + g("DR", "apoiador").com["5D"] > (g("DR", "fixo").com["4D"] || 0) + (g("DR", "fixo").com["5D"] || 0));
assert.ok(g("DR", "invertido").com["2d"] > g("DR", "invertido").com["1D"]);
assert.deepStrictEqual(g("DL", "construtor").com, espelharGrade(g("DR", "construtor").com));
assert.deepStrictEqual(g("WBR", undefined), PAPEIS.apoiador.grade.WBR); // sem papel: o padrão da posição
assert.strictEqual(mapasDoPapel("DR", "fixo", false, false), null); // fora da grade, o de hoje
assert.strictEqual(g("MC", "fixo"), null);
console.log("teste_papeis: ok");

// centroavantes (etapa Atacantes): a mancha da posição deslocada pelo papel; o padrão (Matador no SC, Flutuante no FC) fica com a mancha de hoje
assert.deepStrictEqual(papeisDaPosicao("SC"), ["matador", "pivo", "flutuante", "pressionador"]);
assert.deepStrictEqual(papeisDaPosicao("FC"), ["flutuante", "matador", "pivo", "pressionador"]);
for (const base of ["SC1", "SC2d", "FC1", "FC2d", "FC3d"].map(k => MANCHAS[k])) for (const pos of ["SC", "FC"]) for (const p of papeisDaPosicao(pos)) {
  const m = manchaDoPapel(pos, p, base);
  if (p === PAPEL_PADRAO[pos]) { assert.strictEqual(m, null, pos + " " + p); continue; }
  if (!m) continue;
  for (const f of ["com", "sem"]) { perto(soma(m[f]), 1, `${p}@${pos} ${f}`); assert.ok(Object.keys(m[f]).every(z => ZONAS_GRADE.includes(z)), p); }
}
const pivo = manchaDoPapel("SC", "pivo", MANCHAS.SC1), flu = manchaDoPapel("SC", "flutuante", MANCHAS.SC1), pr = manchaDoPapel("SC", "pressionador", MANCHAS.SC1);
assert.ok(pivo.com["4C"] > MANCHAS.SC1.com["4C"] && pivo.sem === MANCHAS.SC1.sem, "o Pivô joga de costas, um pouco atrás, com a bola");
assert.ok((flu.com["5e"] || 0) > MANCHAS.SC1.com["5e"], "o Flutuante sai para os lados");
assert.ok(pr.sem["5C"] + pr.sem["5e"] + pr.sem["5d"] > MANCHAS.SC1.sem["5C"], "o Pressionador marca mais alto");
assert.strictEqual(manchaDoPapel("SC", "pivo", MANCHAS.SC1), pivo, "feita uma vez só");
perto(gastoDoPapel("SC", "pressionador"), 1.15);
perto(gastoDoPapel("SC", "pivo"), 1);
// preferência do passo: neutra sem papel; o motor manda null no padrão da posição
assert.strictEqual(preferenciaDoPasso(null, "voltar", false), 1);
assert.strictEqual(preferenciaDoPasso("matador", "voltar", false), 1);
assert.ok(preferenciaDoPasso("pivo", "voltar", false) > 1 && preferenciaDoPasso("pivo", "subir", true) < 1);
console.log("teste_papeis: ok (com os centroavantes)");

// pontas (etapa Atacantes): mapa de grade por posição, padrão = mancha de hoje, esquerdo espelhado; cada papel só nas posições dele
assert.deepStrictEqual(papeisDaPosicao("LW"), ["agudo", "pontainvertido", "garcom", "condutor"]);
assert.deepStrictEqual(papeisDaPosicao("ML"), ["garcom", "articulador", "pontainvertido", "operario"]);
assert.strictEqual(papelValido("RW", "operario"), false);
assert.strictEqual(papelValido("DR", "pontainvertido"), false, "o Invertido do ponta não é o do lateral");
for (const pos of ["RW", "AMR", "MR"]) {
  assert.deepStrictEqual(mapasDoPapel(pos, null, true, true), MANCHAS[pos], pos + " padrão = mancha de hoje");
  for (const p of papeisDaPosicao(pos)) { const d = mapasDoPapel(pos, p, true, true), e = mapasDoPapel({ RW: "LW", AMR: "AML", MR: "ML" }[pos], p, true, true);
    assert.deepStrictEqual(e.com, espelharGrade(d.com), pos + " " + p + " espelho"); }
}
const inv = mapasDoPapel("RW", "pontainvertido", true, true), gar = mapasDoPapel("RW", "garcom", true, true);
assert.ok((inv.com["5d"] + inv.com["4d"]) > (MANCHAS.RW.com["5d"] + MANCHAS.RW.com["4d"]), "o Invertido corta para dentro");
assert.ok((gar.sem["3D"] || 0) > (MANCHAS.RW.sem["3D"] || 0), "o Garçom volta");
assert.ok(preferenciaDoPasso("garcom", "cruzar", false) > 1 && preferenciaDoPasso("pontainvertido", "cruzar", false) < 1);
perto(gastoDoPapel("MR", "operario"), 1.1);
console.log("teste_papeis: ok (com os pontas)");

// zagueiros (etapa Atacantes): a mancha do zagueiro (um, dois ou trio) deslocada; o Xerife é o padrão
for (const k of ["DC1", "DC2d", "DC3c", "DC3d"]) for (const p of papeisDaPosicao("DC")) {
  const m = manchaDoPapel("DC", p, MANCHAS[k]);
  if (p === "xerife") { assert.strictEqual(m, null); continue; }
  for (const f of ["com", "sem"]) perto(soma(m[f]), 1, `${p}@${k} ${f}`);
}
const tec = manchaDoPapel("DC", "tecnico", MANCHAS.DC1), cmb = manchaDoPapel("DC", "combativo", MANCHAS.DC1), lib = manchaDoPapel("DC", "libero", MANCHAS.DC1);
assert.ok(tec.com["2C"] > MANCHAS.DC1.com["2C"] && tec.sem === MANCHAS.DC1.sem, "o Técnico pisa no meio com a bola");
assert.ok(cmb.sem["2C"] > MANCHAS.DC1.sem["2C"], "o Combativo sobe para o bote");
assert.ok(lib.sem["1e"] > MANCHAS.DC1.sem["1e"] && lib.sem["1C"] < MANCHAS.DC1.sem["1C"], "o Líbero cobre os lados");
assert.ok(preferenciaDoPasso("tecnico", "pular", false) < 1 && preferenciaDoPasso("tecnico", "lado", true) > 1);
console.log("teste_papeis: ok (com os zagueiros)");

// volantes (passo 3): a mancha do volante deslocada entre faixas; o Primeiro volante é o padrão
for (const k of ["DMC1", "DMC2d"]) for (const p of papeisDaPosicao("DMC")) {
  const m = manchaDoPapel("DMC", p, MANCHAS[k]);
  if (p === "primeirovolante") { assert.strictEqual(m, null); continue; }
  for (const f of ["com", "sem"]) perto(soma(m[f]), 1, `${p}@${k} ${f}`);
}
const naFaixa = (m, f) => Object.entries(m).filter(([z]) => z[0] === f).reduce((a, [, w]) => a + w, 0);
assert.ok(naFaixa(manchaDoPapel("DMC", "distribuidor", MANCHAS.DMC1).com, "1") > naFaixa(MANCHAS.DMC1.com, "1"), "o Distribuidor desce com a bola");
assert.ok(naFaixa(manchaDoPapel("DMC", "boxtobox", MANCHAS.DMC1).com, "3") > naFaixa(MANCHAS.DMC1.com, "3"), "o Box-to-box chega na frente");
assert.ok(naFaixa(manchaDoPapel("DMC", "ladrao", MANCHAS.DMC1).sem, "3") > naFaixa(MANCHAS.DMC1.sem, "3"), "o Ladrão sobe para o bote");
console.log("teste_papeis: ok (com os volantes)");

// meias (passo 3): MC e AMC; os padrões ficam com a mancha de hoje
assert.deepStrictEqual(papeisDaPosicao("MC"), ["organizador", "criador", "boxtobox", "ladrao"]);
assert.deepStrictEqual(papeisDaPosicao("AMC"), ["criador", "infiltrador", "organizador"]);
for (const [pos, ks] of [["MC", ["MC1", "MC2d"]], ["AMC", ["AMC", "AMC2d"]]]) for (const k of ks) for (const p of papeisDaPosicao(pos)) {
  const m = manchaDoPapel(pos, p, MANCHAS[k]);
  if (p === PAPEL_PADRAO[pos]) { assert.strictEqual(m, null); continue; }
  for (const f of ["com", "sem"]) perto(soma(m[f]), 1, `${p}@${pos} ${k} ${f}`);
}
assert.ok(naFaixa(manchaDoPapel("AMC", "infiltrador", MANCHAS.AMC).com, "5") > naFaixa(MANCHAS.AMC.com, "5"), "o Infiltrador chega à área");
assert.ok(naFaixa(manchaDoPapel("MC", "criador", MANCHAS.MC1).com, "4") > naFaixa(MANCHAS.MC1.com, "4"), "o Criador do MC sobe");
console.log("teste_papeis: ok (com os meias)");
