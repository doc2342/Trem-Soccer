// Camada A da revisão de mecânicas: cada atributo muda o jogo pelo caminho certo. Mesmas sementes, só o atributo muda, elencos de 25 atributos (o motor
// completa quem tem 22, e mexer num vetor curto não mede nada). Cada caso confere que a mecânica aconteceu antes de comparar.
// Uso: node ferramentas/teste_mecanicas.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
import { IDX } from "../src/modelo.js";

const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const G = CONFIG.gradeValores, JOGOS = 200;
const onze = (f, s) => gerarOnze(criarRng(s), FORMACOES[f], { nivel: 30, nomes, prefixoId: "p" + s + "_", novos: true });
// a linha toda (menos o goleiro) com os atributos em v
const comAtr = (l, ks, v) => l.map(x => x.pos === "GK" ? x : { ...x, j: { ...x.j, at: x.j.at.map((n, k) => ks.some(c => IDX[c] === k) ? v : n) } });
const partidas = (a, b, ia, ib, f) => { for (let s = 1; s <= JOGOS; s++) f(simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }))); };
const acerto = (a, b, ib = {}) => { let n = 0, g = 0; partidas(a, b, {}, ib, p => { for (const v of Object.values(p.estat[0].grade.passos)) { n += v[0]; g += v[1]; } }); assert.ok(n > 0, "nenhum passo"); return g / n; };
const com = (o, k, v, f) => { const v0 = o[k]; o[k] = v; try { return f(); } finally { o[k] = v0; } };
// sem ver a foto do lance: quem decide bem foge do marcador forte, e o acerto geral esconde o efeito no duelo
const semFoto = f => com(G.foto, "de", 999, () => com(G.foto, "ate", 1000, f));
const A = onze("4-2-3-1", 1), B = onze("4-4-2", 2);

// 1. Lançamento pelo alto: quem lança bem põe a bola limpa, quem lança mal manda para a disputa (quem lança bem também tenta mais, por isso a parcela)
{
  const parcela = v => { const a = comAtr(A, ["plo"], v); let alto = 0, lanc = 0; partidas(a, B, { passe: "misto" }, {}, p => { const g = p.estat[0].grade; alto += g.longas[0]; lanc += g.passos.pular ? g.passos.pular[0] : 0; }); assert.ok(lanc > 0, "nenhum lançamento"); return alto / lanc; };
  const [r, m, b] = [10, 25, 45].map(parcela);
  console.log(`1 lançamento: parcela pelo alto com Passe longo 10/25/45: ${r.toFixed(3)} ${m.toFixed(3)} ${b.toFixed(3)}`);
  assert.ok(r > m && m > b, "lançador bom vai menos para a disputa");
}

// 2. Agressividade: no duelo apertado, ganha quem briga mais. O ganho é medido contra a regra desligada (a Agressividade também pesa na falta e na marcação)
{
  const efeito = v => { const b = comAtr(B, ["agr"], v); return acerto(A, b) - com(G.aperto, "peso", 0, () => acerto(A, b)); };
  const [r, m, b] = [10, 25, 45].map(efeito);
  console.log(`2 agressividade: acerto do rival pela regra com 10/25/45: ${r.toFixed(4)} ${m.toFixed(4)} ${b.toFixed(4)}`);
  assert.ok(r > m && m > b && r > 0 && b < 0, "marcador agressivo ganha o duelo apertado");
}

// 3. Pressão: rende pelos atributos de quem pressiona; a instrução segue valendo e, sem pressão, a regra não muda nada
{
  const KS = ["vel", "res", "agr", "equ"], efeito = (v, pressao) => semFoto(() => { const b = comAtr(B, KS, v); return acerto(A, b, { pressao }) - com(G, "pressaoJogador", 0, () => acerto(A, b, { pressao })); });
  const [r, m, b] = [10, 25, 45].map(v => efeito(v, 2)), um = efeito(45, 1), zero = efeito(45, 0);
  console.log(`3 pressão: acerto do rival pela regra, pressão 2, com 10/25/45: ${r.toFixed(4)} ${m.toFixed(4)} ${b.toFixed(4)}; 45 com pressão 1: ${um.toFixed(4)}; 45 com pressão 0: ${zero}`);
  assert.ok(r > m && m > b && r > 0 && b < 0, "quem pressiona bem rende mais, quem pressiona mal rende menos");
  assert.ok(um < 0 && um > b, "a pressão 1 rende menos que a 2");
  assert.strictEqual(zero, 0, "sem pressão, a regra não muda nada");
}

// 4. Entrelinhas: acontece com a zona ocupada, não na lotada; só por quem pode chegar ali; quem se movimenta melhor ganha mais o passe
{
  const EL = G.entrelinhas, MEIO = new Set(["4e", "4C", "4d"]);
  const conta = (fa, fb = "4-4-2", ks = [], v = 0) => { const a = comAtr(onze(fa, 1), ks, v), b = onze(fb, 2), t = { n: 0, g: 0, zona: {}, inteiro: {}, gk: 0 };
    for (let s = 1; s <= 60; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { registro: reg });
      const inteiro = !Object.values(p.jogadores).some(x => x.saiu != null); // quem sai (lesão sem banco, expulsão) esvazia a zona lotada
      for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && r[8] === "entre") { assert.ok(MEIO.has(r[2]), r[2]); t.n++; t.g += r[6] ? 1 : 0; t.zona[r[2]] = (t.zona[r[2]] || 0) + 1; if (inteiro) t.inteiro[r[2]] = (t.inteiro[r[2]] || 0) + 1; if (p.jogadores[r[5]] && p.jogadores[r[5]].pos === "GK") t.gk++; } }
    return t; };
  const ocupada = conta("4-2-3-1"), semRegra = com(EL, "lotado", 0, () => conta("4-2-3-1")), vazia = conta("4-4-2"), natal = conta("4-3-2-1 (árvore de Natal)"), sem9 = conta("4-1-4-1");
  console.log(`4 entrelinhas por jogo: 4-2-3-1 ${(ocupada.n / 60).toFixed(1)} (sem a regra ${(semRegra.n / 60).toFixed(1)}); 4-4-2 ${(vazia.n / 60).toFixed(1)}; 4-1-4-1 ${(sem9.n / 60).toFixed(1)}; árvore ${JSON.stringify(natal.zona)}, com os 11 ${JSON.stringify(natal.inteiro)}`);
  assert.ok(ocupada.n > 0 && ocupada.zona["4C"] > 0, "4-2-3-1 com a zona 14 ocupada");
  assert.strictEqual(semRegra.n, 0, "sem a regra, a zona ocupada bloqueava");
  assert.ok(vazia.n > 0 && vazia.zona["4C"] > 0, "4-4-2, zona 14 vazia");
  assert.ok(sem9.n > 0, "formação sem quem ocupe a zona 14");
  assert.ok(Object.keys(natal.inteiro).length && !natal.inteiro["4e"] && !natal.inteiro["4d"], "zona lotada não recebe mais um");
  assert.ok(ocupada.gk + vazia.gk + natal.gk === 0, "o goleiro não aparece entre as linhas");
  const [ruim, bom] = [10, 45].map(v => { const t = conta("4-2-3-1", "4-4-2", ["mov"], v); return t.g / t.n; });
  console.log(`4 entrelinhas certas com Movimentação 10/45: ${ruim.toFixed(3)} ${bom.toFixed(3)}`);
  assert.ok(bom > ruim, "quem se movimenta melhor se solta do marcador");
}

console.log("ok: mecânicas");
