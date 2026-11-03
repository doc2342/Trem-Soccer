// Camada A da revisão de mecânicas: cada atributo muda o jogo pelo caminho certo. Mesmas sementes, só o atributo muda, elencos de 25 atributos (o motor
// completa quem tem 22, e mexer num vetor curto não mede nada). Cada caso confere que a mecânica aconteceu antes de comparar.
// Uso: node ferramentas/teste_mecanicas.mjs
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { defesaVistaNaGrade, prepararTime, simularPartida, CONFIG } from "../src/motor.js";
import { IDX } from "../src/modelo.js";
import { colunaDe } from "../src/grade.js";

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
  // o alvo da bola alta nunca é quem lança; quem disputa, pela Força e pelo Posicionamento (a bola no chão pode seguir com ele, "segue com a bola")
  let alvos = 0; partidas(A, B, { passe: "longo" }, {}, p => { for (const l of p.lances) for (const x of l.rota || []) if (x[2] === "pular" && "5".includes(x[1][0]) && "eCd".includes(x[1][1])) { alvos++; assert.notStrictEqual(x[3], x[4], "lançou para si mesmo"); } });
  assert.ok(alvos > 0, "nenhuma bola alta");
  const aereo = v => { const a = comAtr(A, ["for", "pos"], v); let n = 0, g = 0; partidas(a, B, { passe: "longo" }, {}, p => { const e = p.estat[0].grade; n += e.aereos[0]; g += e.aereos[1]; }); return g / n; }, [a10, a45] = [aereo(10), aereo(45)];
  console.log(`1 duelo aéreo ganho com Força e Posicionamento 10/45: ${a10.toFixed(3)} ${a45.toFixed(3)}`);
  assert.ok(a45 > a10, "quem disputa bem ganha pelo alto");
}

// 2. Agressividade: no duelo apertado, ganha quem briga mais. O ganho é medido contra a regra desligada (a Agressividade também pesa na falta e na marcação)
{
  const efeito = v => { const b = comAtr(B, ["agr"], v); return acerto(A, b) - com(G.aperto, "peso", 0, () => acerto(A, b)); };
  const [r, m, b] = [10, 25, 45].map(efeito);
  console.log(`2 agressividade: acerto do rival pela regra com 10/25/45: ${r.toFixed(4)} ${m.toFixed(4)} ${b.toFixed(4)}`);
  assert.ok(r > m && m > b && r > 0 && b < 0, "marcador agressivo ganha o duelo apertado");
  const faltas = v => { const b = comAtr(B, ["agr"], v); let n = 0; partidas(A, b, {}, {}, p => { n += p.estat[1].faltas; }); return n / JOGOS; }, [f10, f45] = [faltas(10), faltas(45)];
  console.log(`2 faltas cometidas por jogo com 10/45: ${f10.toFixed(1)} ${f45.toFixed(1)}`);
  assert.ok(f45 > f10, "a intensidade custa falta");
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

// 5. Comunicação: organiza quem está perto (basculação por faixa e cobertura na zona), sem blindar a defesa
{
  const CM = G.comunica, DEF = ["DC", "DR", "DL", "DMC", "MC"], soDe = (l, ps, v) => l.map(x => ps.includes(x.pos) ? comAtr([x], ["com"], v)[0] : x);
  const atrasV = onze("4-4-2", 2), v = (l, f) => defesaVistaNaGrade(A, l).rapidezF[f];
  const c10 = comAtr(atrasV, ["com"], 10), c45 = comAtr(atrasV, ["com"], 45);
  // alcance: a zaga muda a rapidez da faixa 5 de quem ataca, não a da faixa 1; o atacante, o contrário
  const zaga = soDe(atrasV, ["DC"], 45), frente = soDe(atrasV, ["SC"], 45);
  console.log(`5 rapidez na faixa 5 com 10/45: ${v(c10, 4).toFixed(3)} ${v(c45, 4).toFixed(3)}; só a zaga 45: faixas 5 e 1 ${v(zaga, 4).toFixed(3)} ${v(zaga, 0).toFixed(3)}; só o ataque 45: ${v(frente, 4).toFixed(3)} ${v(frente, 0).toFixed(3)} (base ${v(atrasV, 4).toFixed(3)} ${v(atrasV, 0).toFixed(3)})`);
  assert.ok(v(c45, 4) > v(c10, 4) && v(c45, 4) <= 1 && v(c10, 4) >= 0.2);
  assert.ok(v(zaga, 4) > v(atrasV, 4) && v(zaga, 0) === v(atrasV, 0), "a zaga organiza a zaga");
  assert.ok(v(frente, 4) === v(atrasV, 4) && v(frente, 0) > v(atrasV, 0), "o atacante não organiza a zaga");
  const volume = {}, furos = {}, passos = (b, filtro, ib = {}) => { let n = 0, g = 0; for (let s = 1; s <= 150; s++) { const reg = []; simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: A }), prepararTime({ nome: "B", escalacao: b, instrucoes: ib }), { registro: reg }); for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && filtro(r)) { n++; g += r[6] ? 1 : 0; } } assert.ok(n > 100, `poucos passos: ${n}`); volume[b === c10 ? 10 : 45] = n; furos[b === c10 ? 10 : 45] = g; return g / n; };
  const trocou = r => Math.abs(colunaDe(r[1]) - colunaDe(r[2])) >= 2, naFrente = r => "45".includes(r[2][0]) && trocou(r), virou = r => ["virada", "inversao"].includes(r[3]);
  // A e B: a linha sob pressão, no passe que troca de corredor perto da área; D: a bola muda de corredor
  const [ab10, ab45] = semFoto(() => [c10, c45].map(l => passos(l, naFrente, { pressao: 2 }))); const furou = { ...furos };
  const [d10, d45] = semFoto(() => [c10, c45].map(l => passos(l, virou))), vol = { ...volume };
  // C: o defensor sai para cobrir e abre um buraco; a linha que se fala fecha parte dele. Mede o buraco nas arrumações e o xG da bola nas costas e do cruzamento
  const P3 = onze("4-3-3 com pontas", 1), buraco = l => { const d = defesaVistaNaGrade(P3, l); return Math.max(...["E", "e", "C", "d", "D"].flatMap(c => [d[c].buracos.profundidade, d[c].buracos.cruzamento])); };
  const cruzados = l => { let n = 0; for (let s = 1; s <= 150; s++) n += simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: P3 }), prepararTime({ nome: "B", escalacao: l })).estat[0].grade.cruzamentos[0]; assert.ok(n > 50, "poucos cruzamentos"); return n; };
  const [b10, b45, x10, x45] = [buraco(c10), buraco(c45), cruzados(c10), cruzados(c45)];
  console.log(`5 acerto do rival: linha sob pressão com 10/45 ${ab10.toFixed(3)} ${ab45.toFixed(3)}, passes que furam ${furou[10]} ${furou[45]}; virada e inversão ${d10.toFixed(3)} ${d45.toFixed(3)} (${vol[10]} e ${vol[45]} tentadas); buraco com 10/45 ${b10.toFixed(3)} ${b45.toFixed(3)}, cruzamentos ${x10} ${x45}`);
  assert.ok(furou[45] < furou[10], "a linha sob pressão se organiza: menos passes a furam");
  assert.ok(d45 < d10 && vol[45] < vol[10], "a linha se reorganiza na troca de corredor: o rival acerta menos e tenta menos");
  assert.ok(b45 < b10 && b45 > 1, "a linha que se fala fecha parte do buraco, não todo");
  assert.ok(x45 <= x10, "o buraco menor rende menos cruzamento");
  assert.ok(ab45 > 0.5, "sem bloco perfeito");
}

// 6. Força do goleiro: vale só no contato (bola alta, escanteio), não no chute. Só o goleiro muda
{
  const goleiro = (l, v) => l.map(x => x.pos === "GK" ? { ...x, j: { ...x.j, at: x.j.at.map((n, k) => k === IDX.for ? v : n) } } : x);
  const P3 = onze("4-3-3 com pontas", 1);
  const mede = v => { const b = goleiro(B, v), t = { saidas: [0, 0, 0], cab: 0, escanteios: 0, chutes: 0, gols: 0 };
    partidas(P3, b, { cruzamento: "alto", lado: "lados" }, {}, p => { const e = p.estat[0]; e.grade.saidasAlto.forEach((n, k) => { t.saidas[k] += n; }); t.escanteios += e.escanteios;
      for (const l of p.lances) if (l.time === 0) { if (l.tipo === "escanteio") t.cab++; if (l.tipo === "longe" || l.tipo === "area") { t.chutes++; if (l.resultado === "gol") t.gols++; } } });
    const n = t.saidas[0] + t.saidas[1] + t.saidas[2]; assert.ok(n > 30, `poucas saídas: ${n}`); assert.ok(t.escanteios > 50, "poucos escanteios"); return { ...t, n, segura: t.saidas[0] / n, cabeceio: t.cab / t.escanteios, gol: t.gols / t.chutes }; };
  const [r, m, b] = [10, 25, 45].map(mede);
  console.log(`6 goleiro com Força 10/25/45: saídas ${r.n} ${m.n} ${b.n}; segura ${r.segura.toFixed(3)} ${m.segura.toFixed(3)} ${b.segura.toFixed(3)}; socos ${r.saidas[1]} ${m.saidas[1]} ${b.saidas[1]}; solta ${r.saidas[2]} ${m.saidas[2]} ${b.saidas[2]}; cabeceio por escanteio ${r.cabeceio.toFixed(3)} ${m.cabeceio.toFixed(3)} ${b.cabeceio.toFixed(3)}; gol por chute ${r.gol.toFixed(3)} ${m.gol.toFixed(3)} ${b.gol.toFixed(3)}`);
  assert.ok(r.segura < m.segura && m.segura < b.segura, "o goleiro forte segura mais no contato");
  assert.ok(r.cabeceio > b.cabeceio, "o goleiro forte manda na pequena área");
  assert.ok(r.saidas[2] > 0, "o goleiro fraco às vezes solta");
  assert.ok(Math.abs(r.gol - b.gol) < 0.03, "a Força não defende chute");
}

console.log("ok: mecânicas");
