// Grade 5×5 no motor: força por zona na grade em recalcular/avaliarZonas (Tarefa 3; sem a grade, nada muda; com ela, só chaves da grade, sem NaN),
// a defesa que o atacante enfrenta (Tarefa 4) e a jogada na grade, ligada na T1 (Tarefa 6).
// Uso: node ferramentas/teste_grade_motor.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { avaliarZonas, defesaNaTransicao, defesaVistaNaGrade, prepararTime, simularPartida, CONFIG } from "../src/motor.js";
import { ZONAS_GRADE, ehGrade, corredorDe, LIMITE_DE_PASSOS } from "../src/grade.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const onze = (f, s, papeis = {}) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_" }).map(x => papeis[x.pos] ? { ...x, papel: papeis[x.pos] } : x);
const hash = x => createHash("sha256").update(JSON.stringify(x)).digest("hex");

// sem a grade, igual a antes da Tarefa 3 (valor gravado no teste)
const AVALIAR_ANTES = "c070ddd3f385f569f2c4e04d6dff5d12b1a1d3b15159e798461e624b28be7a96";
assert.strictEqual(hash(avaliarZonas(onze("4-2-3-1", 7))), AVALIAR_ANTES, "avaliarZonas sem a grade mudou");

assert.strictEqual(CONFIG.grade, false);
assert.strictEqual(CONFIG.t1.grade, true); // ligada na Tarefa 6
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

// Tarefa 4: as 5 arrumações e a da transição, cada uma { dz, buracos }; a do centro conserva a defesa
{
  const r = defesaVistaNaGrade(onze("4-2-3-1", 7), onze("4-4-2", 8, { DR: "invertido" }));
  assert.strictEqual(CONFIG.grade, false);
  for (const c of ["E", "e", "C", "d", "D", "T"]) {
    assert.deepStrictEqual(Object.keys(r[c].dz).sort(), ZONAS_GRADE.slice().sort(), c);
    assert.ok(Object.values(r[c].dz).every(v => Number.isFinite(v) && v >= 0), c);
    assert.ok(r[c].buracos.profundidade >= 1 && r[c].buracos.cruzamento >= 1, c);
  }
  const soma = m => Object.values(m).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(soma(r.C.dz) - soma(r.def)) < 1e-6);
  assert.notDeepStrictEqual(r.E.dz, r.D.dz);
  const estr = defesaVistaNaGrade(estranha, onze("3-5-2 com alas", 4));
  assert.ok(["E", "e", "C", "d", "D", "T"].every(c => Object.values(estr[c].dz).every(Number.isFinite)));
}

// Tarefa 6: a jogada na grade, ligada na T1
{
  const jogo = (a, b, s, ia = {}, ib = {}) => simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }));
  const a = onze("4-2-3-1", 1), b = onze("4-4-2", 2);
  // determinismo: mesma semente, mesmo jogo
  assert.strictEqual(JSON.stringify(jogo(a, b, 5).narracao), JSON.stringify(jogo(a, b, 5).narracao));
  // a T1 usa a grade: 25 zonas na estatística, rota com passos [de, para, tipo, passador, receptor, venceu, marcador?], fases no lance
  const p = jogo(a, b, 5);
  assert.deepStrictEqual(Object.keys(p.estat[0].zonas).sort(), ZONAS_GRADE.slice().sort());
  const passos = p.lances.filter(l => l.rota).flatMap(l => l.rota);
  assert.ok(passos.length && passos.every(r => (r.length === 6 || r.length === 7) && ehGrade(r[0]) && ehGrade(r[1]) && typeof r[5] === "boolean"));
  const comFases = p.lances.filter(l => l.fases);
  assert.ok(comFases.length && comFases.every(l => l.texto.endsWith(l.fases[l.fases.length - 1]) && l.fases.length <= CONFIG.gradeValores.narrar.passosChance + 2));
  assert.ok(p.narracao.every(l => !/meia-lua|undefined|NaN/.test(l.texto)));

  // custo e A1, nos mesmos jogos: 4-2-3-1 x 4-4-2 contra pressão 2, metade com a armadilha do lado desligada (constante de antes da grade: 4,1 ms por jogo).
  // A1 isolada: a pressão inteira hoje faz o time atacado perder menos a bola (a compactação em cascata come o reforço da marcação; ver na Tarefa 12)
  const perdaNoLado = [[0, 0], [0, 0]], armadilha = CONFIG.gradeValores.armadilhaLado;
  const t0 = performance.now();
  try {
    for (let s = 1; s <= 300; s++) {
      const liga = s % 2; CONFIG.gradeValores.armadilhaLado = liga ? armadilha : 0;
      const e = jogo(a, b, s, {}, { pressao: 2 }).estat[0];
      for (const [z, [g, x]] of Object.entries(e.zonas)) if ("ED".includes(corredorDe(z))) { perdaNoLado[liga][0] += x; perdaNoLado[liga][1] += g + x; }
    }
  } finally { CONFIG.gradeValores.armadilhaLado = armadilha; }
  const ms = (performance.now() - t0) / 300;
  assert.ok(ms < 3 * 4.1 * 1.5, `custo da grade: ${ms.toFixed(1)} ms por jogo`);
  // A1: a pressão encurrala no lado: com a armadilha, a bola se perde mais nos corredores de lado
  assert.ok(perdaNoLado[1][0] / perdaNoLado[1][1] > perdaNoLado[0][0] / perdaNoLado[0][1], `A1: ${JSON.stringify(perdaNoLado)}`);
  // A4: no mesmo destino (3D), a virada vinda do 3E pega a defesa ainda arrumada do outro lado; o passe de uma coluna, vindo do 3d, já a encontra no lugar
  const v = defesaVistaNaGrade(a, b), comAtraso = antes => v.rapidez * v.D.dz["3D"] + (1 - v.rapidez) * v[antes].dz["3D"];
  assert.ok(v.rapidez > 0 && v.rapidez < 1 && comAtraso("E") < comAtraso("d"));

  // escalação sem ninguém nos corredores de lado da faixa 5: quase nenhum passo vai para lá (Foco da revisão 4)
  const semLados = onze("4-4-2", 9).map((x, k) => ({ ...x, pos: ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "AMC", "AMC", "SC"][k] }));
  let paraLado = 0, todos = 0;
  for (let s = 1; s <= 40; s++) for (const [z, [g, x]] of Object.entries(jogo(semLados, b, s).estat[0].zonas)) { todos += g + x; if (z === "5E" || z === "5D") paraLado += g + x; }
  assert.ok(paraLado / todos < 0.05, `passos para o lado da faixa 5: ${(100 * paraLado / todos).toFixed(1)}%`);

  // formações e instruções sorteadas, expulsões (vermelho direto bem mais provável) e times com 10: todo ataque termina dentro do limite, xG finito
  const formacoes = Object.keys(FORMACOES), r = criarRng(77), um = l => l[r.int(0, l.length - 1)];
  const instr = () => ({ mentalidade: r.int(-2, 2), pressao: r.int(0, 2), agressividade: r.int(-2, 2), passe: um(["misto", "curto", "longo"]), lado: um(["misto", "E", "C", "D", "lados"]),
    finalizar: um(["misto", "longe", "area"]), contraAtaque: r.chance(0.3), impedimento: r.chance(0.3), aoPerder: um(["misto", "pressionar", "recompor"]) });
  const vermelho = CONFIG.vermelhoDireto;
  CONFIG.vermelhoDireto = 0.03;
  try {
    for (let s = 1; s <= 300; s++) {
      const x = onze(um(formacoes), 1000 + s), y = onze(um(formacoes), 2000 + s);
      const q = jogo(s % 5 ? x : x.slice(0, 10), y, s, instr(), instr());
      for (const e of q.estat) assert.ok(e.grade.passosPorAtaque.every(n => n <= LIMITE_DE_PASSOS));
      for (const l of q.lances) { assert.ok(Number.isFinite(l.xg), "xG"); assert.ok(!l.rota || l.rota.length <= LIMITE_DE_PASSOS); }
    }
  } finally { CONFIG.vermelhoDireto = vermelho; }
}

console.log("teste_grade_motor: ok");
