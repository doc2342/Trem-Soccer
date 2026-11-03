// Grade 5×5 no motor: força por zona na grade em recalcular/avaliarZonas (Tarefa 3; sem a grade, nada muda; com ela, só chaves da grade, sem NaN),
// a defesa que o atacante enfrenta (Tarefa 4), a jogada na grade, ligada na T1 (Tarefa 6), o fim por corredor (Tarefa 7) e o terceiro homem,
// a bola longa e a segunda bola (Tarefa 8) e a transição (Tarefa 9).
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
  assert.ok(comFases.length && comFases.every(l => l.texto.endsWith(l.fases[l.fases.length - 1]) && l.fases.length <= 2 * CONFIG.gradeValores.narrar.passosChance + 2)); // os passos narrados mais as frases de ligação ("a bola volta para"), que crescem com as posses longas
  assert.ok(p.narracao.every(l => !/meia-lua|undefined|NaN/.test(l.texto)));

  // custo e A1, nos mesmos jogos: 4-2-3-1 x 4-4-2 contra pressão 2, metade com a armadilha do lado desligada (constante de antes da grade: 4,1 ms por jogo).
  // A1 isolada: a pressão inteira hoje faz o time atacado perder menos a bola (a compactação em cascata come o reforço da marcação; ver na Tarefa 12)
  const perdaNoLado = [[0, 0], [0, 0]], armadilha = CONFIG.gradeValores.armadilhaLado;
  let ms = 0, ms9 = 0;
  try {
    for (let s = 1; s <= 300; s++) {
      const liga = s % 2; CONFIG.gradeValores.armadilhaLado = liga ? armadilha : 0;
      // a grade e a T0 cronometradas jogo a jogo: em blocos, carga da máquina só durante a grade dava 40× sem o motor ter piorado; intercalado, 11× com ou sem carga
      const t0 = performance.now(), e = jogo(a, b, s, {}, { pressao: 2 }).estat[0], t1 = performance.now();
      simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b, instrucoes: { pressao: 2 } }), { regrasT1: false });
      ms += t1 - t0; ms9 += performance.now() - t1;
      for (const [z, [g, x]] of Object.entries(e.zonas)) if ("ED".includes(corredorDe(z))) { perdaNoLado[liga][0] += x; perdaNoLado[liga][1] += g + x; }
    }
  } finally { CONFIG.gradeValores.armadilhaLado = armadilha; }
  ms /= 300; ms9 /= 300; // a régua é a T0 medida junto: o tempo absoluto muda com a carga da máquina
  if (process.env.MEDIR) console.log("custo", ms.toFixed(1), "T0", ms9.toFixed(1));
  // o custo acompanha os passos: com o limite de 12 para 30, os ataques vão até o fim (135 → 163 passos por time) e o custo por passo não piorou
  // 15×: com a foto do lance o custo oscila de 10,7× a 12,8× a T0 (~45 ms contra 3,6). O limite de verdade é a CPU da função rodada: conferir nos amistosos
  assert.ok(ms < 15 * ms9, `custo da grade: ${ms.toFixed(1)} ms por jogo (T0 ${ms9.toFixed(1)} ms)`);
  // A1: a pressão encurrala no lado: com a armadilha, a bola se perde mais nos corredores de lado
  assert.ok(perdaNoLado[1][0] / perdaNoLado[1][1] > perdaNoLado[0][0] / perdaNoLado[0][1], `A1: ${JSON.stringify(perdaNoLado)}`);
  // a foto do lance: vendo o colega e o marcador reais, o time escolhe os mano a mano bons e acerta mais passes do que sem vê-los
  const acerto = () => { let c = 0, t = 0; for (let s = 1; s <= 200; s++) for (const [n, k] of Object.values(jogo(a, b, s, {}, {}).estat[0].grade.passos)) { t += n; c += k; } return c / t; };
  const FT = CONFIG.gradeValores.foto, { de, ate } = FT, vista = acerto();
  let cega; try { FT.de = 98; FT.ate = 99; cega = acerto(); } finally { FT.de = de; FT.ate = ate; }
  assert.ok(vista > cega, `foto do lance: ${vista.toFixed(4)} vista, ${cega.toFixed(4)} cega`);
  if (process.env.MEDIR) console.log("foto", vista.toFixed(4), cega.toFixed(4));
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

// Tarefa 7: o fim da jogada pelo corredor, em 2.000 jogos da T1 com formações e instruções sorteadas
{
  const jogo = (a, b, s, ia = {}, ib = {}) => simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }));
  const formacoes = Object.keys(FORMACOES), r = criarRng(91), um = l => l[r.int(0, l.length - 1)];
  const instr = () => ({ mentalidade: r.int(-2, 2), pressao: r.int(0, 2), passe: um(["misto", "curto", "longo"]), lado: um(["misto", "E", "C", "D", "lados"]),
    finalizar: um(["misto", "longe", "area"]), cruzamento: um(["misto", "alto", "rasteiro"]), contraAtaque: r.chance(0.3), impedimento: r.chance(0.3) });
  const porZona = {}, porTipo = {}, xgTipo = {};
  let cutbacks = 0, toques = 0; const cruz = [0, 0], T8 = {}, T9 = { inicio: {}, perdas: 0, chutes: 0, corredor: { E: 0, e: 0, C: 0, d: 0, D: 0 } };
  for (let s = 1; s <= 2000; s++) {
    const q = jogo(onze(um(formacoes), 3000 + s), onze(um(formacoes), 4000 + s), s, instr(), instr());
    for (const e of q.estat) for (const k of ["tabelas", "terceiros", "aereos", "segundas", "longas", "sobras"]) { const t = T8[k] = T8[k] || [0, 0]; t[0] += e.grade[k][0]; t[1] += e.grade[k][1]; }
    for (const l of q.lances) for (const r of l.rota || []) assert.ok(ehGrade(r[0]) && ehGrade(r[1]) && typeof r[5] === "boolean");
    // Tarefa 9: a faixa em que o contra começou, pela linha antiga da perda (D, M, A)
    for (const e of q.estat) { for (const [k, n] of Object.entries(e.grade.contraInicio)) T9.inicio[k] = (T9.inicio[k] || 0) + n; T9.perdas += e.grade.perdasAtras; T9.chutes += e.grade.perdasAtrasChute; for (const c in T9.corredor) T9.corredor[c] += e.grade.contraPorCorredor[c]; }
    for (const e of q.estat) { cutbacks += e.grade.cutbacks[0]; toques += e.grade.toquesArea; cruz[0] += e.grade.cruzamentos[0]; cruz[1] += e.grade.cruzamentos[1]; }
    for (const l of q.lances) {
      if (!l.zona) continue; // bola parada
      assert.ok(Number.isFinite(l.xg) && l.xg > 0 && l.xg <= 0.92, `xG ${l.tipo}`); // o publicado, com o goleiro (teto do chanceDeGol)
      (porZona[l.zona] = porZona[l.zona] || {})[l.tipo] = (porZona[l.zona][l.tipo] || 0) + 1;
      porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1; xgTipo[l.tipo] = (xgTipo[l.tipo] || 0) + l.xg;
    }
  }
  const soma = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  // nenhum chute de jogo corrido das faixas 1–3
  assert.ok(Object.keys(porZona).every(z => z[0] === "4" || z[0] === "5"), Object.keys(porZona).join());
  // do 5E/5D, quase só cruzamento e cutback
  const lado5 = ["5E", "5D"].map(z => porZona[z] || {}), longe5 = lado5.reduce((a, o) => a + (o.longe || 0), 0), tot5 = lado5.reduce((a, o) => a + soma(o), 0);
  assert.ok(tot5 && longe5 / tot5 < 0.05, `longe do 5E/5D: ${longe5}/${tot5}`);
  assert.ok(porTipo.cutback > 0 && cutbacks === porTipo.cutback, "cutback");
  // cruzamento antecipado só da faixa 4 de lado; da faixa 4 só sai cruzamento (lado) ou longe (zona 14)
  for (const z of ["4E", "4D"]) assert.ok(Object.keys(porZona[z] || {}).every(t => t === "cruzamento" || t === "corte" || t === "longe"), z);
  assert.ok((porZona["4E"] || {}).cruzamento > 0 || (porZona["4D"] || {}).cruzamento > 0, "cruzamento antecipado");
  assert.ok(Object.keys(porZona).filter(z => z[0] === "4").every(z => ["4E", "4e", "4C", "4d", "4D"].includes(z)), "faixa 4");
  // do meio-espaço da faixa 4 (dono, 02/11), só o cruzamento
  for (const z of ["4e", "4d"]) assert.ok(Object.keys(porZona[z] || {}).every(t => t === "cruzamento"), z);
  assert.ok(toques > 0);
  // Tarefa 8: aparecem tabelas, terceiros homens, duelos aéreos, segundas bolas (da bola longa e do cruzamento afastado), cada uma ganha às vezes
  for (const [k, [n, g]] of Object.entries(T8)) assert.ok(n > 0 && g > 0 && g < n, `${k}: ${n}/${g}`);
  assert.strictEqual(T8.longas[0], T8.aereos[0]); // toda bola longa tem o duelo aéreo
  assert.strictEqual(T8.longas[1], T8.segundas[1]); // e quem fica com a segunda bola fica com o lançamento
  // Tarefa 9: o contra começa na faixa espelho da perda (perda na faixa 2 dele, linha M → contra da faixa 4 nossa), não sempre no meio
  const permitido = { D: "5", M: "34", A: "12" };
  assert.ok(Object.keys(T9.inicio).every(k => permitido[k[0]].includes(k[1])), JSON.stringify(T9.inicio));
  assert.ok(T9.inicio.M4 > 0 && T9.inicio.A1 > 0 && T9.inicio.D5 > 0, JSON.stringify(T9.inicio));
  assert.ok(T9.perdas > 0 && T9.chutes > 0 && T9.chutes < T9.perdas);
  const somaC = soma(T9.corredor); assert.ok(somaC > 0 && (T9.corredor.e + T9.corredor.C + T9.corredor.d) / somaC > 0.5, JSON.stringify(T9.corredor));
  if (process.env.MEDIR) {
    console.log("perda nas faixas 1–2 que vira chute", (100 * T9.chutes / T9.perdas).toFixed(1) + "%", "chutes de contra por e/C/d", (100 * (T9.corredor.e + T9.corredor.C + T9.corredor.d) / somaC).toFixed(0) + "%", JSON.stringify(T9.inicio));
    console.log(Object.fromEntries(Object.keys(porTipo).map(t => [t, `${(100 * porTipo[t] / soma(porTipo)).toFixed(1)}% xG ${(xgTipo[t] / porTipo[t]).toFixed(3)}`])));
    console.log(Object.fromEntries(Object.entries(porZona).map(([z, o]) => [z, JSON.stringify(o)])));
    console.log(Object.fromEntries(Object.entries(T8).map(([k, [n, g]]) => [k, `${(n / 4000).toFixed(2)} por time, ${(100 * g / n).toFixed(0)}%`])));
    console.log("toques na área por time e jogo", (toques / 4000).toFixed(1), "cutbacks", (cutbacks / 4000).toFixed(2), "cruzamentos", (cruz[0] / 4000).toFixed(1), "certos", (100 * cruz[1] / cruz[0]).toFixed(1) + "%");
  }
}

// Tarefa 8: o bônus do terceiro homem cresce contra a pressão e quase some contra a retranca. Isolado (bônus ampliado ligado × desligado, mesmas
// sementes): a contagem crua dá o contrário (contra a retranca o time vive no campo de ataque; contra a pressão a volta é roubada, o lado ruim)
{
  const jogo = (a, b, s, ib) => simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }));
  const a = onze("4-2-3-1", 1), b = onze("4-4-2", 2), T = CONFIG.gradeValores.terceiro, b0 = T.bonus;
  const acerto = (ib, bonus) => { T.bonus = bonus; const t = [0, 0]; for (let s = 1; s <= 600; s++) { const g = jogo(a, b, s, ib).estat[0].grade.terceiros; t[0] += g[0]; t[1] += g[1]; } return t[1] / t[0]; };
  try {
    const ganho = ib => acerto(ib, 2) - acerto(ib, 0), pressao = ganho({ pressao: 2 }), retranca = ganho({ mentalidade: -2 });
    assert.ok(pressao > retranca + 0.1, `terceiro homem: ganho contra a pressão ${pressao.toFixed(2)}, contra a retranca ${retranca.toFixed(2)}`);
  } finally { T.bonus = b0; }
}

// Tarefa 9: quem rouba sem espaço recicla em vez de contra-atacar (mesmas sementes, com e sem a reciclagem)
{
  const jogo = (a, b, s, ia, ib) => simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }));
  const a = onze("4-2-3-1", 1), b = onze("4-4-2", 2), G = CONFIG.gradeValores, r0 = G.reciclar;
  const contras = rec => { G.reciclar = rec; let n = 0, k = 0; for (let s = 1; s <= 150; s++) for (const e of jogo(a, b, s, { contraAtaque: true }, { mentalidade: 1, contraAtaque: true }).estat) { n += e.contraAtaques; k += e.grade.reciclagens; } return [n, k]; };
  try {
    const [com, recicladas] = contras(r0), [sem, zero] = contras(0);
    assert.ok(recicladas > 0 && zero === 0 && com < sem, `contras com reciclagem ${com} (${recicladas} recicladas), sem ${sem}`);
  } finally { G.reciclar = r0; }
}

console.log("teste_grade_motor: ok");
