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
import { mapasDoPapel } from "../src/papeis.js";

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

// 7. Cruzamento: sai do lado e do meio-espaço, rende pelo Cruzamento de quem cruza; perto da última linha, levar a bola é driblar
{
  const P3 = onze("4-3-3 com pontas", 1), AC = G.chance.antecipado;
  const mede = (a, b = B) => { const t = { n: 0, c: 0, meio: 0, f5: [0, 0], lado: 0 }; for (let s = 1; s <= JOGOS; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: b }), { registro: reg }), e = p.estat[0].grade; t.n += e.cruzamentos[0]; t.c += e.cruzamentos[1];
    for (const l of p.lances) if (l.time === 0 && l.tipo === "cruzamento" && l.zona && "ed".includes(l.zona[1])) t.meio++;
    for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && r[7] && r[2][0] === "5") { t.f5[0]++; t.f5[1] += r[6] ? 1 : 0; if (r[1][0] === "5") t.lado++; } } return t; };
  const [ruim, bom] = [10, 45].map(v => { const t = mede(comAtr(P3, ["cru"], v)); return t.c / t.n; }), base = mede(P3), semMeio = com(AC, "meio", 0, () => mede(P3));
  console.log(`7 cruzamentos por time: ${(base.n / JOGOS).toFixed(2)} (sem o meio-espaço ${(semMeio.n / JOGOS).toFixed(2)}), certos do meio-espaço ${base.meio}; acerto com Cruzamento 10/45: ${ruim.toFixed(3)} ${bom.toFixed(3)}`);
  assert.ok(base.meio > 2 * semMeio.meio && base.meio > 0, "o cruzamento certo do meio-espaço depende da regra (com peso 0 a opção ainda sai, pelo piso da nota)");
  assert.ok(base.n > semMeio.n, "o meio-espaço soma cruzamentos");
  assert.ok(bom > ruim, "quem cruza bem acerta mais");
  const livre = com(G.conduzir, "faixas", [0, 0, 0, 0, 0], () => mede(P3)), [dr, db] = [10, 45].map(v => { const t = mede(comAtr(P3, ["dri"], v)); return t.f5[1] / t.f5[0]; });
  console.log(`7 conduções para a faixa 5 por time: ${(base.f5[0] / JOGOS).toFixed(1)}, de lado na área ${(base.lado / JOGOS).toFixed(1)} (sem a regra ${(livre.f5[0] / JOGOS).toFixed(1)}, ${(livre.lado / JOGOS).toFixed(1)}); acerto ${(base.f5[1] / base.f5[0]).toFixed(3)} (sem a regra ${(livre.f5[1] / livre.f5[0]).toFixed(3)}); com Drible 10/45: ${dr.toFixed(3)} ${db.toFixed(3)}`);
  assert.ok(base.lado < livre.lado && base.f5[1] / base.f5[0] < livre.f5[1] / livre.f5[0], "levar a bola na área deixa de ser de graça");
  assert.ok(db > dr, "quem dribla bem leva melhor");
}

// 8. Movimentação: quem se movimenta melhor ganha a corrida no espaço e se solta para o terceiro homem; no contra-ataque, o atacante de dentro abre nas costas
// do lateral; na faixa 5 a corrida também vale com pouca gente nossa na zona
{
  const ES = G.espaco, ab = { mentalidade: 1 };
  const mede = a => { const t = { esp: [0, 0], ter: [0, 0], abre: 0 }; partidas(a, B, {}, ab, p => { const e = p.estat[0].grade; t.esp[0] += e.espaco[0]; t.esp[1] += e.espaco[1]; t.ter[0] += e.terceiros[0]; t.ter[1] += e.terceiros[1];
    for (const ev of p.narracao) if (ev.time === 0 && /abre nas costas/.test(JSON.stringify(ev))) t.abre++; }); return t; };
  const [r, b] = [10, 45].map(v => mede(comAtr(A, ["mov"], v))), base = mede(A), vazia = com(ES, "lotado", 0, () => mede(A));
  console.log(`8 espaço por jogo com Movimentação 10/45: ${(r.esp[0] / JOGOS).toFixed(2)} ${(b.esp[0] / JOGOS).toFixed(2)}, acerto ${(r.esp[1] / r.esp[0]).toFixed(3)} ${(b.esp[1] / b.esp[0]).toFixed(3)}; terceiro homem certo ${(r.ter[1] / r.ter[0]).toFixed(3)} ${(b.ter[1] / b.ter[0]).toFixed(3)}; abre nas costas ${base.abre}; espaço só na zona vazia ${(vazia.esp[0] / JOGOS).toFixed(2)} × ${(base.esp[0] / JOGOS).toFixed(2)}`);
  assert.ok(b.esp[1] / b.esp[0] > r.esp[1] / r.esp[0] && b.esp[0] > r.esp[0], "quem se movimenta melhor ganha a corrida, e o passe sai mais");
  assert.ok(b.ter[1] / b.ter[0] > r.ter[1] / r.ter[0], "quem se movimenta melhor se solta para o terceiro homem");
  assert.ok(base.abre > 0, "no contra-ataque, o atacante de dentro abre nas costas do lateral");
  assert.ok(base.esp[0] > vazia.esp[0], "a corrida também vale na zona pouco ocupada da faixa 5");
}

// 9. Zagueiro de lado no trio (aprovado 28/10; manchas DC3d da grade): os dois de fora cobrem o lado e marcam o ponta, o do meio guarda o centro
{
  const KS = ["des", "mar", "pos"], P3 = onze("4-3-3 com pontas", 1), T3 = onze("3-5-2 com alas", 2);
  const fracos = quais => { let n = 0; return T3.map(x => x.pos !== "DC" ? x : quais.includes(++n) ? comAtr([x], KS, 10)[0] : x); };
  const mede = b => { const t = { lado: [0, 0], meio: [0, 0] }; for (let s = 1; s <= JOGOS; s++) { const reg = []; simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: P3 }), prepararTime({ nome: "B", escalacao: b }), { registro: reg });
    for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && r[2] >= "4") { const o = "ED".includes(r[2][1]) ? t.lado : r[2][1] === "C" ? t.meio : null; if (o) { o[0]++; o[1] += r[6] ? 1 : 0; } } }
    return { lado: t.lado[1] / t.lado[0], meio: t.meio[1] / t.meio[0] }; };
  const [fora, meio] = [mede(fracos([1, 3])), mede(fracos([2]))];
  console.log(`9 trio, acerto do rival com os de fora fracos × o do meio fraco: pelo lado ${fora.lado.toFixed(3)} ${meio.lado.toFixed(3)}; pelo centro ${fora.meio.toFixed(3)} ${meio.meio.toFixed(3)}`);
  assert.ok(fora.lado > meio.lado + 0.02, "pelo lado, quem marca o ponta são os de fora");
  assert.ok(meio.meio > fora.meio, "o do meio guarda o centro");
}

// 10. Cruzamento por poste (aprovado 29/10): o ponta do lado oposto ataca o segundo poste, marcado pelo lateral de lá; quem chega de trás recebe a bola
// rolada, marcado pelo meio. Cada marcador só pesa no seu lance
{
  const P3 = onze("4-3-3 com pontas", 1), so = (l, ps, ks, v) => l.map(x => ps.includes(x.pos) ? comAtr([x], ks, v)[0] : x);
  const mede = b => { const t = { cruz: 0, p2: [0, 0], ch: [0, 0] }; partidas(P3, b, { cruzamento: "alto" }, {}, p => { for (const l of p.lances) if (l.time === 0) { const tx = JSON.stringify(l);
    if (l.tipo === "cruzamento") { t.cruz++; if (tx.includes("segundo poste")) { t.p2[0]++; t.p2[1] += l.xg; } } if (l.tipo === "cutback" && tx.includes("chega de trás")) { t.ch[0]++; t.ch[1] += l.xg; } } });
    return { parte: t.p2[0] / t.cruz, p2: t.p2[1] / t.p2[0], ch: t.ch[1] / t.ch[0], n: t.ch[0] }; };
  const L = ["DL", "DR"], M = ["MC", "DMC"], base = mede(B), [l10, l45] = [10, 45].map(v => mede(so(B, L, ["cab", "mar", "for"], v))), [m10, m45] = [10, 45].map(v => mede(so(B, M, ["mar", "pos"], v)));
  console.log(`10 segundo poste: ${(100 * base.parte).toFixed(1)}% dos cruzamentos; xG com os laterais rivais 10/45 ${l10.p2.toFixed(3)} ${l45.p2.toFixed(3)}, com o meio rival 10/45 ${m10.p2.toFixed(3)} ${m45.p2.toFixed(3)}; quem chega de trás (${base.n}): xG com o meio 10/45 ${m10.ch.toFixed(3)} ${m45.ch.toFixed(3)}`);
  assert.ok(base.parte > 0.1, "o segundo poste é alvo de verdade");
  assert.ok(l10.p2 > l45.p2 * 1.3, "o lateral de lá marca o segundo poste");
  assert.ok(Math.abs(m10.p2 - m45.p2) < (l10.p2 - l45.p2) / 2, "o meio não marca o segundo poste");
  assert.ok(base.n > 0 && m10.ch > m45.ch, "quem chega de trás é marcado pelo meio");
}

// 11. Papéis do centroavante (fichas de 29/10): o Matador é o padrão (nada muda); o Pivô escora e pede o cruzamento; o Flutuante recebe entre as linhas
// e chuta menos; o Pressionador aperta a saída de bola do rival (o rival acerta menos contra ele do que com a regra desligada: contar roubadas, ou
// comparar com o Matador, não serve, porque quem decide bem foge do marcador forte e ele marca zonas mais vazias) e cansa mais
{
  // o 9 com o fôlego e a pegada de quem pressiona (a pressão rende pelos atributos de quem pressiona, mecânica 3: com eles abaixo da média, pressionar piora)
  const P4 = onze("4-2-3-1", 1).map(x => x.pos === "SC" ? comAtr([x], ["vel", "res", "agr", "equ"], 35)[0] : x), com9 = papel => P4.map(x => x.pos === "SC" ? { ...x, papel } : x), id9 = P4.find(x => x.pos === "SC").j.id;
  const mede = papel => { const a = com9(papel), t = { escora: 0, cruz: 0, entre: 0, chutes: 0, alto: [0, 0], energia: 0, gols: 0 };
    for (let s = 1; s <= 150; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: B }), { registro: reg }), e = p.estat[0];
      t.cruz += e.grade.cruzamentos[0]; t.gols += e.gols; t.chutes += p.jogadores[id9].finalizacoes || 0; t.energia += p.jogadores[id9].energia ?? 0;
      for (const ev of p.narracao) if (ev.time === 0 && /escora/.test(JSON.stringify(ev))) t.escora++;
      for (const r of reg) { if (r[0] === 0 && r[1] !== "fim" && r[2][0] === "4" && r[5] === id9 && r[6]) t.entre++; if (r[0] === 1 && r[1] !== "fim" && "12".includes(r[2][0]) && r[9] === id9) { t.alto[0]++; t.alto[1] += r[6] ? 1 : 0; } } }
    return t; };
  const [pad, mat, piv, flu, pre] = [null, "matador", "pivo", "flutuante", "pressionador"].map(mede), semRegra = com(G, "pressionador", 0, () => mede("pressionador"));
  console.log(`11 centroavante (padrão/Pivô/Flutuante/Pressionador): escoras ${pad.escora} ${piv.escora}; cruzamentos ${pad.cruz} ${piv.cruz}; recepções dele na faixa 4 ${pad.entre} ${flu.entre}; chutes dele ${pad.chutes} ${flu.chutes}; acerto do rival na saída contra o Pressionador com e sem a regra ${(pre.alto[1] / pre.alto[0]).toFixed(3)} ${(semRegra.alto[1] / semRegra.alto[0]).toFixed(3)}; energia ${(pad.energia / 150).toFixed(1)} ${(pre.energia / 150).toFixed(1)}`);
  assert.deepStrictEqual(mat, pad, "o Matador é o centroavante de hoje");
  assert.ok(piv.escora > pad.escora && piv.cruz > pad.cruz, "o Pivô escora e pede o cruzamento");
  assert.ok(flu.entre > pad.entre && flu.chutes < pad.chutes, "o Flutuante recebe entre as linhas e chuta menos");
  assert.ok(pre.alto[1] / pre.alto[0] < semRegra.alto[1] / semRegra.alto[0] && pre.energia < pad.energia, "o Pressionador aperta a saída do rival e cansa mais");
}

// 12. Papéis do ponta (fichas de 29/10): o Agudo é o padrão do RW (nada muda); o Invertido corta para dentro, chuta mais e cruza menos; o Garçom cruza
// mais; o Condutor leva a bola; no MR, o Articulador gira por dentro (o time cruza menos) e o Operário volta para fechar o lado e cansa mais
{
  const P3 = onze("4-3-3 com pontas", 1), Q4 = onze("4-4-2", 3);
  const mede = (l, pos, papel) => { const a = l.map(x => x.pos === pos ? { ...x, papel } : x), id = a.find(x => x.pos === pos).j.id, t = { chutes: 0, cruz: 0, conduz: 0, dentro: 0, energia: 0, sem: 0 };
    for (let s = 1; s <= 150; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: B }), { registro: reg });
      t.cruz += p.estat[0].grade.cruzamentos[0]; t.chutes += p.jogadores[id].finalizacoes || 0; t.energia += p.jogadores[id].energia ?? 0;
      for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && r[6]) { if (r[7] && r[4] === id) t.conduz++; if (r[5] === id && "ed".includes(r[2][1])) t.dentro++; } }
    const m = mapasDoPapel(pos, papel, true, true); t.sem = m ? (m.sem["2D"] || 0) + (m.sem["1D"] || 0) : 0; return t; };
  const [pad, agu, inv, gar, con] = [null, "agudo", "pontainvertido", "garcom", "condutor"].map(p => mede(P3, "RW", p));
  const [mr, art, ope] = [null, "articulador", "operario"].map(p => mede(Q4, "MR", p));
  console.log(`12 ponta no RW (padrão/Invertido/Garçom/Condutor): chutes dele ${pad.chutes} ${inv.chutes}; cruzamentos ${pad.cruz} ${inv.cruz} ${gar.cruz}; conduções certas dele ${pad.conduz} ${con.conduz}; no MR (padrão/Articulador/Operário): recepções dele por dentro ${mr.dentro} ${art.dentro}; cruzamentos ${mr.cruz} ${art.cruz}; peso atrás sem a bola ${mr.sem.toFixed(2)} ${ope.sem.toFixed(2)}; energia ${(mr.energia / 150).toFixed(1)} ${(ope.energia / 150).toFixed(1)}`);
  assert.deepStrictEqual(agu, pad, "o Agudo é o ponta de hoje");
  assert.ok(inv.chutes > pad.chutes && inv.cruz < pad.cruz, "o Invertido corta para dentro e chuta");
  assert.ok(gar.cruz > pad.cruz, "o Garçom cruza mais");
  assert.ok(con.conduz > pad.conduz, "o Condutor leva a bola");
  assert.ok(art.dentro > mr.dentro && art.cruz < mr.cruz, "o Articulador gira por dentro");
  assert.ok(ope.sem > mr.sem && ope.energia < mr.energia, "o Operário volta e cansa mais");
}

// 13. Papéis do zagueiro (fichas de 28 e 29/10): o Xerife é o padrão (nada muda); o Técnico joga curto e conduz; o Combativo deixa as costas para a bola em
// profundidade do rival (medido contra a regra desligada); o Líbero corta a bola em profundidade, mais quanto melhores o Posicionamento e a Velocidade
{
  const Q4 = onze("4-4-2", 3), comZag = (papel, ks = [], v = 0) => Q4.map(x => x.pos === "DC" ? { ...(ks.length ? comAtr([x], ks, v)[0] : x), papel } : x), ids = new Set(Q4.filter(x => x.pos === "DC").map(x => x.j.id));
  const mede = l => { const t = { pular: 0, passes: 0, conduz: 0, xgP: 0, nP: 0 };
    for (let s = 1; s <= 150; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: l }), prepararTime({ nome: "B", escalacao: B }), { registro: reg });
      for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && ids.has(r[4])) { if (r[7]) t.conduz++; else { t.passes++; if (r[3] === "pular" || r[3] === "longa") t.pular++; } }
      for (const l2 of p.lances) if (l2.time === 1 && l2.tipo === "profundidade") { t.nP++; t.xgP += l2.xg; } }
    return { ...t, xg: t.xgP / t.nP }; };
  const [pad, xer, tec, cmb, lr, lb] = [mede(comZag(null)), mede(comZag("xerife")), mede(comZag("tecnico")), mede(comZag("combativo")), mede(comZag("libero", ["pos", "vel"], 10)), mede(comZag("libero", ["pos", "vel"], 45))];
  const PD = G.papelDefesa, semCostas = com(PD, "combativo", 0, () => com(PD, "combativoCorrida", 0, () => mede(comZag("combativo"))));
  console.log(`13 zagueiro: lançamentos dele por passe (padrão/Técnico) ${(pad.pular / pad.passes).toFixed(3)} ${(tec.pular / tec.passes).toFixed(3)}; conduções ${pad.conduz} ${tec.conduz}; xG da bola em profundidade do rival: Combativo com e sem a regra ${cmb.xg.toFixed(3)} ${semCostas.xg.toFixed(3)} (${cmb.nP} e ${semCostas.nP}); Líbero com Posicionamento e Velocidade 10/45 ${lr.xg.toFixed(3)} ${lb.xg.toFixed(3)}, Xerife ${pad.xg.toFixed(3)}`);
  assert.deepStrictEqual(xer, pad, "o Xerife é o zagueiro de hoje");
  assert.ok(tec.pular / tec.passes < pad.pular / pad.passes && tec.conduz > pad.conduz, "o Técnico joga curto e conduz");
  assert.ok(cmb.xg > semCostas.xg && cmb.nP >= semCostas.nP, "o Combativo deixa as costas");
  assert.ok(lb.xg < lr.xg && lb.xg < pad.xg, "o Líbero corta a bola em profundidade, pelo Posicionamento e pela Velocidade");
}

// 14. Papéis do volante (fichas de 28 e 29/10): o Primeiro volante é o padrão (nada muda); o Distribuidor desce para receber e inverte; o Box-to-box chega
// na frente e cansa mais; o Ladrão de bola sobe para o bote, faz mais falta e cansa mais
{
  const P4 = onze("4-2-3-1", 1), ids = new Set(P4.filter(x => x.pos === "DMC").map(x => x.j.id));
  const mede = papel => { const a = P4.map(x => x.pos === "DMC" ? { ...x, papel } : x), t = { atras: 0, frente: 0, viradas: 0, faltas: 0, energia: 0 };
    for (let s = 1; s <= 150; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: B }), { registro: reg });
      for (const id of ids) { t.energia += p.jogadores[id].energia ?? 0; t.faltas += p.jogadores[id].faltas || 0; }
      for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && r[6]) { if (ids.has(r[5]) && r[2][0] === "1") t.atras++; if (ids.has(r[5]) && "34".includes(r[2][0])) t.frente++; if (ids.has(r[4]) && (r[3] === "virada" || r[3] === "inversao")) t.viradas++; } }
    return t; };
  const [pad, pv, dis, box, lad] = [null, "primeirovolante", "distribuidor", "boxtobox", "ladrao"].map(mede);
  console.log(`14 volante (padrão/Distribuidor/Box/Ladrão): recebe na faixa 1 ${pad.atras} ${dis.atras}; viradas e inversões dele ${pad.viradas} ${dis.viradas}; recebe nas faixas 3–4 ${pad.frente} ${box.frente}; faltas ${pad.faltas} ${lad.faltas}; energia ${(pad.energia / 300).toFixed(1)} ${(box.energia / 300).toFixed(1)} ${(lad.energia / 300).toFixed(1)}`);
  assert.deepStrictEqual(pv, pad, "o Primeiro volante é o volante de hoje");
  assert.ok(dis.atras > pad.atras && dis.viradas > pad.viradas, "o Distribuidor desce e inverte");
  assert.ok(box.frente > pad.frente && box.energia < pad.energia, "o Box-to-box chega na frente e cansa");
  assert.ok(lad.faltas > pad.faltas && lad.energia < pad.energia, "o Ladrão faz mais falta e cansa");
}

// 15. Papéis do meia (fichas de 29/10): no AMC, o Criador é o padrão; o Infiltrador chega à área e chuta mais; o Organizador recua para armar. No MC, o
// Organizador é o padrão; o Criador sobe para receber entre as linhas; o Ladrão faz mais falta
{
  const P4 = onze("4-2-3-1", 1), P3 = onze("4-3-3 com pontas", 1);
  const mede = (l, pos, papel) => { const a = l.map(x => x.pos === pos ? { ...x, papel } : x), ids = new Set(a.filter(x => x.pos === pos).map(x => x.j.id)), t = { chutes: 0, f4: 0, f3: 0, faltas: 0 };
    for (let s = 1; s <= 150; s++) { const reg = [], p = simularPartida(criarRng(s), prepararTime({ nome: "A", escalacao: a }), prepararTime({ nome: "B", escalacao: B }), { registro: reg });
      for (const id of ids) { t.chutes += p.jogadores[id].finalizacoes || 0; t.faltas += p.jogadores[id].faltas || 0; }
      for (const r of reg) if (r[0] === 0 && r[1] !== "fim" && r[6] && ids.has(r[5])) { if (r[2][0] === "4") t.f4++; if (r[2][0] === "3") t.f3++; } }
    return t; };
  const [amc, cri, inf, org] = [null, "criador", "infiltrador", "organizador"].map(p => mede(P4, "AMC", p));
  const [mc, org2, cri2, lad] = [null, "organizador", "criador", "ladrao"].map(p => mede(P3, "MC", p));
  console.log(`15 meia no AMC (padrão/Infiltrador/Organizador): chutes ${amc.chutes} ${inf.chutes} ${org.chutes}; recebe na faixa 3 ${amc.f3} ${org.f3}; no MC (padrão/Criador/Ladrão): recebe na faixa 4 ${mc.f4} ${cri2.f4}; faltas ${mc.faltas} ${lad.faltas}`);
  assert.deepStrictEqual(cri, amc, "o Criador é o meia de hoje");
  assert.deepStrictEqual(org2, mc, "o Organizador é o meio-campista de hoje");
  assert.ok(inf.chutes > amc.chutes, "o Infiltrador chega à área e chuta");
  assert.ok(org.f3 > amc.f3 && org.chutes < amc.chutes, "o Organizador recua para armar");
  assert.ok(cri2.f4 > mc.f4, "o Criador do MC sobe para receber entre as linhas");
  assert.ok(lad.faltas > mc.faltas, "o Ladrão faz mais falta");
}

console.log("ok: mecânicas");
