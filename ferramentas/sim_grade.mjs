// Régua da calibragem da grade 5×5 (Tarefa 10 do plano docs/superpowers/plans/2026-10-31-grade-5x5.md): uma linha por meta da seção 11 do spec,
// meta | medido | ok/fora, separadas em obrigatórias e de esforço; sai com código 1 se alguma obrigatória ficar fora.
// Jogos entre formações dos bots sorteadas, nível 30, instruções sorteadas, regras da T1 (como sim_transicao). Os passos de todos os ataques vêm do
// opcoes.registro do motor ([time, de, para, tipo, passador, receptor, venceu, conduziu] e [time, "fim", xG, chutes] no fim de cada ataque).
// Uso: node ferramentas/sim_grade.mjs [jogos] [GRUPO]   GRUPO: geral, passe, combinacoes, finalizacao, transicao, aerea, formacoes (sem: todos)
//   GV='{"dificuldade":{"subir":-0.5}}' muda CONFIG.gradeValores; T1='{...}' muda CONFIG.t1; CFG='{...}' muda o CONFIG (um nível, como sim_transicao).
//   Fora da régua (rodar à parte): os papéis de lateral/ala (sim_papeis_laterais) e o valor das posições (sim_valor_posicao), que são obrigatórias.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { criarRng } from "../src/rng.js";
import { gerarOnze } from "../src/gerador.js";
import { FORMACOES } from "../src/escalacao.js";
import { FORMACOES_BOT } from "../src/bot.js";
import { prepararTime, simularPartida, CONFIG } from "../src/motor.js";
import { ZONAS_GRADE, faixaDe, colunaDe, valorDaZona } from "../src/grade.js";

const junta = (alvo, de) => { for (const k in de) alvo[k] = de[k] && typeof de[k] === "object" && alvo[k] && typeof alvo[k] === "object" ? { ...alvo[k], ...de[k] } : de[k]; };
junta(CONFIG.t1, JSON.parse(process.env.T1 || "{}"));
junta(CONFIG, JSON.parse(process.env.CFG || "{}"));
junta(CONFIG.gradeValores, JSON.parse(process.env.GV || "{}"));
const nomes = JSON.parse(readFileSync(new URL("../dados/nomes.json", import.meta.url)));
const pega = (rng, l) => l[Math.floor(rng.n() * l.length)];
export const onze = (s, f, nivel = 30) => gerarOnze(criarRng(s), FORMACOES[f], { nivel, nomes, prefixoId: "p" + s + "_" });
const instrucoes = rng => ({
  mentalidade: pega(rng, [-1, 0, 0, 0, 1]), pressao: pega(rng, [0, 1, 1, 2]), passe: pega(rng, ["misto", "curto", "longo"]),
  contraAtaque: rng.chance(0.25), impedimento: rng.chance(0.25), aoPerder: pega(rng, ["misto", "misto", "misto", "pressionar", "recompor"]),
});
const OPTA = { A: 1, E: 1, M: 0.5, D: 0 }, PARADA = new Set(["escanteio", "falta", "penalti"]);
const VOLANTE = new Set(["DMC"]), ZAGUEIRO = new Set(["DC", "SW"]), PONTA = new Set(["RW", "LW", "AMR", "AML"]), ATAQUE = new Set(["SC", "FC", "RW", "LW", "AMR", "AML"]);
const FRENTE = new Set(["subir", "diagonal", "pular", "longa", "inversao"]); // passos que sobem de faixa (a inversão também sobe)

// Joga n partidas e devolve os totais. jogo(n) → { a, b, ia, ib, fa, fb } escolhe os times (padrão: formações dos bots sorteadas).
export function jogar(N, jogo = null, semente = 7) {
  const rng = criarRng(semente);
  const t = { jogos: 0, gols: 0, golsMin: [0, 0, 0, 0, 0, 0, 0], noGol: 0, lances: 0, xgJ: 0, chJ: 0, xgC: 0, chC: 0, golsContra: 0, contras: 0,
    golsTipo: {}, chJF5: 0, chJF5C: 0, ataques: 0, ataquesChute: 0, posses10: 0, passosNoGol: [], estatPassos: [0, 0],
    tipo: {}, meio: { diagonal: 0, subir: 0 }, ladoF: { diagonal: 0, subir: 0 }, movs: 0, voltas: 0, pularF: [[0, 0], [0, 0], [0, 0]], longas: 0, passes: 0,
    tabelas: 0, terceiros: 0, cutbacks: 0, cruz: [0, 0], toques: 0, aereos: [0, 0], segundas: [0, 0], lancadorFica: [0, 0], sobras: [0, 0],
    porPos: { volante: [0, 0], zagueiro: [0, 0], ponta: [0, 0] }, dribles: [0, 0], enfiadas: [0, 0], espaco: [0, 0], entre: [0, 0],
    ppda: { 0: [0, 0], 1: [0, 0], 2: [0, 0] }, roubadas: { 0: [0, 0], 1: [0, 0], 2: [0, 0] }, perdasAtras: 0, perdasAtrasChute: 0, contraCorredor: { E: 0, e: 0, C: 0, d: 0, D: 0 },
    golsContraN: 0, xgZona: ZONAS_GRADE.map(() => [0, 0]), entradas: 0, entradasPosse: [0, 0], progressivos: [0, 0], fundos: 0, sca: 0, gca: 0,
    territorio: [], faltas: 0, amarelos: 0, escanteios: 0, rodadas: [] };
  for (let n = 0; n < N; n++) {
    const p0 = jogo ? jogo(n, rng) : null;
    const fa = p0 ? p0.fa : pega(rng, FORMACOES_BOT), fb = p0 ? p0.fb : pega(rng, FORMACOES_BOT);
    const a = p0 && p0.a || onze(1000 + n, fa), b = p0 && p0.b || onze(9000 + n, fb), ia = p0 && p0.ia || instrucoes(rng), ib = p0 && p0.ib || instrucoes(rng);
    const casa = n % 2 === 0, ta = prepararTime({ nome: "A", escalacao: a, instrucoes: ia }), tb = prepararTime({ nome: "B", escalacao: b, instrucoes: ib });
    const registro = [];
    const p = casa ? simularPartida(criarRng(n), ta, tb, { registro }) : simularPartida(criarRng(n), tb, ta, { registro });
    const instr = casa ? [ia, ib] : [ib, ia], eu = casa ? 0 : 1;
    t.jogos++;
    // lances (finalizações)
    for (const l of p.lances) {
      const gol = l.resultado === "gol"; t.lances++;
      if (gol) { t.gols++; t.golsTipo[l.tipo] = (t.golsTipo[l.tipo] || 0) + 1; t.golsMin[Math.min(6, Math.floor((l.min - 1) / 15))]++; if (l.contra) { t.golsContra += OPTA[l.contra]; t.golsContraN++; } }
      if (gol || l.resultado === "defesa") t.noGol++;
      if (l.tipo === "profundidade") { t.enfiadas[0]++; t.enfiadas[1]++; } // a enfiada da faixa 5 chega (vira chute)
      const acoes = (l.rota || []).filter(r => r.length >= 6).length; t.sca += Math.min(2, acoes); if (gol) t.gca += Math.min(2, acoes);
      if (l.tipo === "penalti") continue;
      if (l.contra) { t.xgC += l.xg; t.chC++; } else if (!PARADA.has(l.tipo)) { t.xgJ += l.xg; t.chJ++; if (l.zona && faixaDe(l.zona) === 5) { t.chJF5++; if (l.zona[1] === "C") t.chJF5C++; } }
    }
    // estatística da partida
    p.estat.forEach((e, i) => {
      const g = e.grade; t.ataques += e.ataques; t.contras += e.contraAtaques; t.faltas += e.faltas; t.amarelos += e.amarelos; t.escanteios += e.escanteios;
      for (const k in g.passos) { t.estatPassos[0] += g.passos[k][0]; t.estatPassos[1] += g.passos[k][1]; }
      t.posses10 += g.posses10; t.passosNoGol.push(...g.passosNoGol); t.tabelas += g.tabelas[1]; t.terceiros += g.terceiros[1]; t.cutbacks += g.cutbacks[1];
      t.cruz[0] += g.cruzamentos[0]; t.cruz[1] += g.cruzamentos[1]; t.toques += g.toquesArea; t.aereos[0] += g.aereos[0]; t.aereos[1] += g.aereos[1];
      t.segundas[0] += g.segundas[0]; t.segundas[1] += g.segundas[1]; t.lancadorFica[0] += g.longas[0]; t.lancadorFica[1] += g.longas[1]; t.sobras[0] += g.sobras[0]; t.sobras[1] += g.sobras[1];
      t.perdasAtras += g.perdasAtras; t.perdasAtrasChute += g.perdasAtrasChute; for (const c in g.contraPorCorredor) t.contraCorredor[c] += g.contraPorCorredor[c];
    });
    // passos de todos os ataques (registro)
    const pos = id => p.jogadores[id] && p.jogadores[id].pos;
    const passos = [0, 0], fundo = [0, 0], entradas = [0, 0], xg = p.xg;
    let zonas = new Set();
    for (const r of registro) {
      const [i] = r;
      if (r[1] === "fim") { t.ataquesChute += r[3] > 0; for (const k of zonas) { t.xgZona[k][0]++; t.xgZona[k][1] += r[2]; } zonas = new Set(); continue; }
      const [, de, para, tp, quem, , venceu, conduziu, espaco] = r, tipo = tp === "longa" ? "pular" : tp, fd = faixaDe(de), fp = faixaDe(para), cd = colunaDe(de), cp = colunaDe(para);
      zonas.add(ZONAS_GRADE.indexOf(de)); if (venceu) zonas.add(ZONAS_GRADE.indexOf(para));
      passos[i]++; if (fp <= 2) fundo[i]++;
      if (espaco === "entre") { t.entre[0]++; if (venceu) t.entre[1]++; }
      if (espaco === "espaco") { t.espaco[0]++; if (venceu) t.espaco[1]++; if (fp >= 4) { t.enfiadas[0]++; if (venceu) t.enfiadas[1]++; } }
      if (conduziu) { if (ATAQUE.has(pos(quem))) { t.dribles[0]++; if (venceu) t.dribles[1]++; } }
      else {
        const k = t.tipo[tipo] = t.tipo[tipo] || [0, 0]; k[0]++; if (venceu) k[1]++;
        t.passes++; if (tipo === "pular" || tipo === "virada" || tipo === "inversao") t.longas++;
        const cat = VOLANTE.has(pos(quem)) ? "volante" : ZAGUEIRO.has(pos(quem)) ? "zagueiro" : PONTA.has(pos(quem)) ? "ponta" : null;
        if (cat) { t.porPos[cat][0]++; if (venceu) t.porPos[cat][1]++; }
        if (tipo === "pular" && fd <= 3) { t.pularF[fd - 1][0]++; }
        if (fd <= 3) t.pularF[fd - 1][1]++;
      }
      t.movs++; if (tipo === "voltar") t.voltas++;
      if (cd === 1 || cd === 3) { if (tipo === "diagonal") t.meio.diagonal++; else if (tipo === "subir") t.meio.subir++; }
      if (cd === 0 || cd === 4) { if (tipo === "diagonal") t.ladoF.diagonal++; else if (tipo === "subir") t.ladoF.subir++; }
      if (venceu && fd < 4 && fp >= 4) { t.entradas++; entradas[i]++; }
      if (FRENTE.has(tp) && fp > fd) { t.progressivos[conduziu ? 1 : 0] += venceu; }
      if (venceu && fp === 5 && tp !== "cruzar") t.fundos++;
      // PPDA de quem defende (1 − i): passes certos do atacante nas faixas 1–3 dele ÷ ações defensivas ali (passos que ele perdeu); roubadas = perdas nas faixas 1–2 dele
      const pr = instr[1 - i].pressao;
      if (fp <= 3) { if (venceu && !conduziu) t.ppda[pr][0]++; if (!venceu) t.ppda[pr][1]++; }
      if (!venceu && fp <= 2) t.roubadas[pr][0]++;
    }
    for (const pr of [0, 1, 2]) t.roubadas[pr][1] += instr.filter(x => x.pressao === pr).length;
    const posse = [p.estat[0].posse, p.estat[1].posse];
    for (const i of [0, 1]) {
      if (posse[i] > 55) { t.entradasPosse[0] += entradas[i]; t.entradasPosse[1]++; }
      if (passos[i]) t.territorio.push([fundo[i] / passos[i], xg[i], posse[i]]);
    }
    t.rodadas.push({ eu, p, fa, fb });
    if (!jogo) t.rodadas.length = 0; // só os grupos que precisam guardam a partida
  }
  return t;
}

// ---------- a tabela ----------
const pc = v => (100 * v).toFixed(1) + "%", f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), r = (a, b) => b ? a / b : 0;
const linhas = { obrigatoria: [], esforco: [], info: [] };
const meta = (tipo, grupo, nome, alvo, medido, ok) => linhas[tipo].push([grupo, nome, alvo, medido, ok === null ? "—" : ok ? "ok" : "FORA"]);
const entre = (v, a, b) => v >= a && v <= b;

function geral(t) {
  const j = t.jogos, G = "geral";
  const gols = t.gols / j, conv = r(t.gols, t.noGol), contra = r(t.golsContra, t.gols), cruz = r(t.golsTipo.cruzamento || 0, t.gols);
  const pen = r(t.golsTipo.penalti || 0, t.gols), esc = r(t.golsTipo.escanteio || 0, t.gols), acerto = r(t.estatPassos[1], t.estatPassos[0]);
  // gols (dono, 31/10): do Brasileirão (FotMob, 1,24 por time) à média das 8 europeias (1,44 por time), no lugar dos ~2,3 do spec
  meta("obrigatoria", G, "gols por jogo", "Brasileirão 2,48 a Europa 2,88", f2(gols), entre(gols, 2.48, 2.88));
  meta("obrigatoria", G, "conversão no alvo", "~30% (27–33)", pc(conv), entre(conv, 0.27, 0.33));
  meta("obrigatoria", "transicao", "gols de contra-ataque (régua Opta)", "5–7%", pc(contra), entre(contra, 0.05, 0.07));
  meta("obrigatoria", "finalizacao", "gols de cruzamento", "13–20%", pc(cruz), entre(cruz, 0.13, 0.20));
  meta("obrigatoria", "finalizacao", "gols de pênalti", "~8,8% (7–11)", pc(pen), entre(pen, 0.07, 0.11));
  meta("obrigatoria", "finalizacao", "gols de escanteio", "~11,8% (10–14)", pc(esc), entre(esc, 0.10, 0.14));
  meta("obrigatoria", "passe", "acerto geral de passe (estat.grade.passos)", "82–84%", pc(acerto), entre(acerto, 0.82, 0.84));
  const posses = t.ataques / j, chute = r(t.ataquesChute, t.ataques);
  meta("esforco", G, "posses por jogo (os dois times)", "~100 (conferência, decisão 1a)", f1(posses), entre(posses, 85, 115));
  meta("esforco", G, "posses que acabam em chute", "~10%", pc(chute), entre(chute, 0.07, 0.13));
  const fim = t.golsMin[5] + t.golsMin[6], media15 = t.gols / 6;
  meta("esforco", G, "gols depois dos 75' (÷ média de 15 min)", "pico (> 1)", f2(r(fim, media15)), fim > media15);
  // Brasileirão (FotMob, plano Tarefa 12), por time
  meta("esforco", G, "faltas por time", "13,3 (Brasileirão)", f1(t.faltas / j / 2), entre(t.faltas / j / 2, 11, 16));
  meta("esforco", G, "amarelos por time", "2,5 (Brasileirão)", f2(t.amarelos / j / 2), entre(t.amarelos / j / 2, 2, 3));
  meta("esforco", G, "escanteios por time", "5,0 (Brasileirão)", f1(t.escanteios / j / 2), entre(t.escanteios / j / 2, 4, 6));
}

function passe(t) {
  const j = t.jogos, G = "passe", tp = k => t.tipo[k] || [0, 0], soma = ks => ks.reduce((s, k) => [s[0] + tp(k)[0], s[1] + tp(k)[1]], [0, 0]);
  const facil = soma(["voltar", "lado"]), uma = soma(["subir", "diagonal"]), dificil = soma(["pular", "virada", "inversao"]);
  meta("esforco", G, "acerto voltar/lado", "~95%", pc(r(facil[1], facil[0])), entre(r(facil[1], facil[0]), 0.92, 0.97));
  meta("esforco", G, "acerto uma faixa (subir/diagonal)", "~84%", pc(r(uma[1], uma[0])), entre(r(uma[1], uma[0]), 0.80, 0.88));
  meta("esforco", G, "acerto pular faixa/virada/inversão", "~50%", pc(r(dificil[1], dificil[0])), entre(r(dificil[1], dificil[0]), 0.42, 0.58));
  const dm = r(t.meio.diagonal, t.meio.subir), dl = r(t.ladoF.subir, t.ladoF.diagonal);
  meta("esforco", G, "do meio-espaço: diagonal ÷ reto", "≈ 2", f2(dm), entre(dm, 1.6, 2.5));
  meta("esforco", G, "do lado: reto ÷ diagonal", "> 1", f2(dl), dl > 1);
  meta("esforco", G, "volta (% dos movimentos)", "12–22%", pc(r(t.voltas, t.movs)), entre(r(t.voltas, t.movs), 0.12, 0.22));
  const pf = t.pularF.map(([a, b]) => r(a, b));
  meta("esforco", G, "pular faixa da faixa 1 / 2 / 3", "19% / 7% / 3%", pf.map(pc).join(" / "), entre(pf[0], 0.14, 0.24) && entre(pf[1], 0.04, 0.10) && entre(pf[2], 0.01, 0.05));
  const v = tp("virada");
  meta("esforco", G, "virada lado→lado (% dos movimentos; acerto)", "~1%; ~40%", `${pc(r(v[0], t.movs))}; ${pc(r(v[1], v[0]))}`, entre(r(v[0], t.movs), 0.005, 0.02) && entre(r(v[1], v[0]), 0.32, 0.48));
  meta("esforco", G, "bola longa (pular+virada+inversão, % dos passes)", "~10%", pc(r(t.longas, t.passes)), entre(r(t.longas, t.passes), 0.07, 0.13));
  meta("esforco", G, "posses de 10 passes ou mais por jogo", "11–16", f1(t.posses10 / j), entre(t.posses10 / j, 11, 16));
  const pg = t.passosNoGol.reduce((s, x) => s + x, 0) / (t.passosNoGol.length || 1);
  meta("esforco", G, "passes na jogada de gol (média)", "~3,9", f2(pg), entre(pg, 3.3, 4.5));
  for (const [k, a, b, alvo] of [["volante", 0.90, 0.96, "90–96%"], ["zagueiro", 0.89, 0.91, "89–91%"], ["ponta", 0.73, 0.85, "73–85%"]])
    meta("esforco", G, `acerto de passe do ${k}`, alvo, pc(r(t.porPos[k][1], t.porPos[k][0])), entre(r(t.porPos[k][1], t.porPos[k][0]), a, b));
  meta("esforco", G, "drible certo dos atacantes", "32–57%", pc(r(t.dribles[1], t.dribles[0])), entre(r(t.dribles[1], t.dribles[0]), 0.32, 0.57));
  // valor por zona: xG médio das jogadas que passam pela zona × o xT da 5×5 (correlação)
  const xt = ZONAS_GRADE.map(z => valorDaZona(z, CONFIG.gradeValores)), med = t.xgZona.map(([n, x]) => r(x, n));
  const corr = (a, b) => { const ma = a.reduce((s, x) => s + x, 0) / a.length, mb = b.reduce((s, x) => s + x, 0) / b.length; let c = 0, va = 0, vb = 0; a.forEach((x, k) => { c += (x - ma) * (b[k] - mb); va += (x - ma) ** 2; vb += (b[k] - mb) ** 2; }); return c / Math.sqrt(va * vb || 1); };
  meta("esforco", G, "xG da jogada pela zona segue o xT (correlação)", "> 0,8", f2(corr(med, xt)), corr(med, xt) > 0.8);
  meta("info", G, "xG da jogada por zona (faixa 5 em cima)", "—", [5, 4, 3, 2, 1].map(f => med.slice(5 * f - 5, 5 * f).map(x => x.toFixed(3)).join(" ")).join(" | "), null);
  const vert = r(uma[0] + dificil[0] - tp("virada")[0], facil[0] + tp("virada")[0]);
  meta("info", G, "índice de verticalidade (frente ÷ lado e trás)", "—", f2(vert), null);
  meta("info", G, "passes / conduções progressivos certos por time", "—", `${f1(t.progressivos[0] / j / 2)} / ${f1(t.progressivos[1] / j / 2)}`, null);
}

function combinacoes(t) {
  const j = t.jogos;
  meta("esforco", "combinacoes", "tabelas certas por jogo", "~4", f2(t.tabelas / j), entre(t.tabelas / j, 3, 5));
  meta("esforco", "combinacoes", "terceiro homem chegando ao terço final por jogo", "~0,4", f2(t.terceiros / j), entre(t.terceiros / j, 0.25, 0.6));
}

function finalizacao(t, forte) {
  const j = t.jogos, G = "finalizacao";
  meta("esforco", G, "chutes de jogo corrido da faixa 5", "quase todos (≥ 85%)", pc(r(t.chJF5, t.chJ)), r(t.chJF5, t.chJ) >= 0.85);
  meta("esforco", G, "dos chutes da faixa 5, pelo centro", "~50%", pc(r(t.chJF5C, t.chJF5)), entre(r(t.chJF5C, t.chJF5), 0.42, 0.58));
  meta("esforco", G, "cut-backs certos por jogo", "0,5–1", f2(t.cutbacks / j), entre(t.cutbacks / j, 0.5, 1));
  meta("esforco", G, "toques na área por time", "14–22", f1(t.toques / j / 2), entre(t.toques / j / 2, 14, 22));
  meta("esforco", G, "cruzamentos por time (Brasileirão ~19); acerto 19–30%", "~19; 24%", `${f1(t.cruz[0] / j / 2)}; ${pc(r(t.cruz[1], t.cruz[0]))}`, entre(t.cruz[0] / j / 2, 15, 23) && entre(r(t.cruz[1], t.cruz[0]), 0.19, 0.30));
  meta("esforco", G, "enfiadas por time (profundidade + espaço nas faixas 4–5; certas)", "2–6 (~30%)", `${f2(t.enfiadas[0] / j / 2)} (${pc(r(t.enfiadas[1], t.enfiadas[0]))})`, entre(t.enfiadas[0] / j / 2, 2, 6));
  meta("info", G, "passes entrelinhas para zona vazia por time (certos)", "—", `${f2(t.entre[0] / j / 2)} (${pc(r(t.entre[1], t.entre[0]))})`, null);
  meta("info", G, "passes no espaço por time (certos)", "—", `${f2(t.espaco[0] / j / 2)} (${pc(r(t.espaco[1], t.espaco[0]))})`, null);
  meta("esforco", G, "chutes no alvo", "37–54%", pc(r(t.noGol, t.lances)), entre(r(t.noGol, t.lances), 0.37, 0.54));
  const xgc = r(t.xgJ + t.xgC, t.chJ + t.chC);
  meta("esforco", G, "xG por chute (sem bola parada)", "0,11–0,12", f2(xgc), entre(xgc, 0.10, 0.13));
  meta("info", G, "SCA / GCA por time", "—", `${f1(t.sca / j / 2)} / ${f2(t.gca / j / 2)}`, null);
  meta("info", G, "deep completions (passo certo na faixa 5) por time", "—", f1(t.fundos / j / 2), null);
  if (forte) {
    meta("esforco", G, "time forte (nível 40 × 30): chutes; xG", "12–16; ≥ 1,8", `${f1(forte.chutes)}; ${f2(forte.xg)}`, entre(forte.chutes, 12, 16) && forte.xg >= 1.8);
    meta("esforco", G, "time forte: toques na área; sofridos", "30–35; 10–13", `${f1(forte.toques)}; ${f1(forte.sofridos)}`, entre(forte.toques, 30, 35) && entre(forte.sofridos, 10, 13));
  }
}

function transicao(t) {
  const j = t.jogos, G = "transicao", x = r(r(t.xgC, t.chC), r(t.xgJ, t.chJ));
  meta("esforco", G, "xG por chute de contra ÷ jogo corrido", "~1,4", f2(x), entre(x, 1.25, 1.55));
  const ef = r(r(t.golsContraN, t.contras), r(t.gols - t.golsContraN, t.ataques - t.contras));
  meta("esforco", G, "eficácia do contra-ataque (gols por ataque ÷ o resto)", "~2,5", f2(ef), entre(ef, 2, 3));
  const cc = t.contraCorredor, tot = Object.values(cc).reduce((s, v) => s + v, 0);
  meta("esforco", G, "chutes de contra pelas colunas 2–4", "~80%", pc(r(cc.e + cc.C + cc.d, tot)), entre(r(cc.e + cc.C + cc.d, tot), 0.72, 0.88));
  meta("esforco", G, "perda nas faixas 1–2 → chute do adversário", "~20%", pc(r(t.perdasAtrasChute, t.perdasAtras)), entre(r(t.perdasAtrasChute, t.perdasAtras), 0.15, 0.25));
  const pp = k => r(t.ppda[k][0], t.ppda[k][1]);
  meta("esforco", G, "PPDA de quem pressiona 2 / 0", "5–8 / 15–20", `${f1(pp(2))} / ${f1(pp(0))}`, entre(pp(2), 5, 8) && entre(pp(0), 15, 20));
  const sofr = r(t.ppda[0][0] + t.ppda[1][0] + t.ppda[2][0], t.ppda[0][1] + t.ppda[1][1] + t.ppda[2][1]);
  meta("esforco", G, "PPDA sofrido (média)", "10–15", f1(sofr), entre(sofr, 10, 15));
  const rb = r(t.roubadas[2][0], t.roubadas[2][1]);
  meta("esforco", G, "roubadas no terço final por jogo (pressão 2)", "~7", f1(rb), entre(rb, 5, 9));
  meta("info", G, "contra-ataques por jogo", "—", f2(t.contras / j), null);
}

function aerea(t) {
  const j = t.jogos, G = "aerea";
  meta("esforco", G, "duelos aéreos por time", "~26 (16–32)", f1(t.aereos[0] / j / 2), entre(t.aereos[0] / j / 2, 16, 32));
  meta("esforco", G, "segunda bola do time que ganhou no alto", "26–36%", pc(r(t.segundas[1], t.segundas[0])), entre(r(t.segundas[1], t.segundas[0]), 0.26, 0.36));
  meta("esforco", G, "quem lança fica com a bola", "~25% (20–30)", pc(r(t.lancadorFica[1], t.lancadorFica[0])), entre(r(t.lancadorFica[1], t.lancadorFica[0]), 0.2, 0.3));
  meta("info", G, "sobra do cruzamento afastado: por time; nossa", "—", `${f2(t.sobras[0] / j / 2)}; ${pc(r(t.sobras[1], t.sobras[0]))}`, null);
}

// território sem xG e entradas no terço final (do registro de todas as partidas)
function territorio(t) {
  const l = [...t.territorio].sort((a, b) => b[0] - a[0]), q = Math.floor(l.length / 4), med = (v, k) => v.reduce((s, x) => s + x[k], 0) / (v.length || 1);
  const alto = l.slice(0, q), resto = l.slice(q);
  meta("esforco", "formacoes", "território sem xG: 25% mais atrás, posse; xG (× o resto)", "posse e menos xG", `${f1(med(alto, 2))}% ${f2(med(alto, 1))} × ${f1(med(resto, 2))}% ${f2(med(resto, 1))}`, med(alto, 1) < med(resto, 1));
  meta("esforco", "formacoes", "entradas no terço final do time com posse > 55%", "~30", f1(r(t.entradasPosse[0], t.entradasPosse[1])), entre(r(t.entradasPosse[0], t.entradasPosse[1]), 24, 36));
}

// confrontos de formações (spec 11): o mesmo par jogado nos dois mandos, instruções sorteadas
function formacoes(N) {
  const conf = (fa, fb) => {
    const rodou = jogar(N, (n, rng) => ({ fa, fb }), 13);
    let pts = 0; const info = { cruzSofridos: [0, 0], ataquesSofridos: { E: 0, C: 0, D: 0 }, meus: { E: 0, C: 0, D: 0 }, contrasSofridos: 0, passos4: [0, 0] };
    for (const { eu, p } of rodou.rodadas) {
      const [g, s] = [p.placar[eu], p.placar[1 - eu]]; pts += (g > s ? 3 : g === s ? 1 : 0) - (s > g ? 3 : g === s ? 1 : 0);
      const ad = p.estat[1 - eu]; info.cruzSofridos[0] += ad.grade.cruzamentos[0]; info.cruzSofridos[1] += ad.grade.cruzamentos[1]; info.contrasSofridos += ad.contraAtaques;
      for (const c of "ECD") { info.ataquesSofridos[c] += ad.corredor[c]; info.meus[c] += p.estat[eu].corredor[c]; }
    }
    return { pts: pts / N, info, n: N };
  };
  const G = "formacoes", s = v => (v >= 0 ? "+" : "") + v.toFixed(2);
  const ref = conf("4-4-2", "4-4-2"), cruzRef = r(ref.info.cruzSofridos[0], ref.n), ladoRef = r(ref.info.ataquesSofridos.E + ref.info.ataquesSofridos.D, ref.info.ataquesSofridos.C + ref.info.ataquesSofridos.E + ref.info.ataquesSofridos.D);
  const vs = (a, b, maior) => { const c = conf(a, b); meta("esforco", G, `${a} × ${b}: saldo de pontos por jogo`, maior ? "> 0" : "< 0", s(c.pts), maior ? c.pts > 0 : c.pts < 0); return c; };
  vs("4-2-3-1", "4-4-2", true); vs("4-2-3-1", "3-5-2 com alas", false); vs("4-2-3-1", "4-4-2 losango", false);
  const c532 = conf("5-3-2", "4-4-2"), a532 = r(c532.info.cruzSofridos[1], c532.info.cruzSofridos[0]), aRef = r(ref.info.cruzSofridos[1], ref.info.cruzSofridos[0]);
  meta("esforco", G, "5-3-2 × 4-4-2: cruzamentos sofridos; acerto deles (× 4-4-2 espelho)", "mais; menor", `${f1(r(c532.info.cruzSofridos[0], c532.n))}; ${pc(a532)} × ${f1(cruzRef)}; ${pc(aRef)}`, r(c532.info.cruzSofridos[0], c532.n) > cruzRef && a532 < aRef);
  const c541 = conf("4-1-4-1", "5-4-1"), c5_ = conf("4-1-4-1", "5-3-2");
  meta("esforco", G, "4-1-4-1 contra 5 atrás (5-4-1, 5-3-2): saldo", "< 0", `${s(c541.pts)}, ${s(c5_.pts)}`, c541.pts < 0 && c5_.pts < 0);
  for (const f of ["4-3-2-1 (árvore de Natal)", "4-4-2 losango"]) {
    const c = conf(f, "4-4-2"), sofr = c.info.ataquesSofridos, meus = c.info.meus;
    const lado = r(sofr.E + sofr.D, sofr.E + sofr.C + sofr.D), centro = r(meus.C, meus.E + meus.C + meus.D);
    meta("esforco", G, `${f}: sofre pelo lado; ataca por dentro (× 4-4-2)`, `> ${pc(ladoRef)}; maior`, `${pc(lado)}; ${pc(centro)} × ${pc(1 - ladoRef)}`, lado > ladoRef && centro > 1 - ladoRef);
  }
  meta("info", G, "4-2-4 fácil de contra-atacar", "—", "sem 4-2-4 em FORMACOES", null);
  // o 4-3-3 ocupa com a bola os dois meios-espaços da faixa 4
  const reg = [], ta = prepararTime({ nome: "A", escalacao: onze(77, "4-3-3 com pontas"), instrucoes: {} }), tb = prepararTime({ nome: "B", escalacao: onze(78, "4-4-2"), instrucoes: {} });
  const em = { "4e": 0, "4d": 0 }; let tot = 0;
  for (let n = 0; n < Math.max(20, N / 5); n++) { reg.length = 0; simularPartida(criarRng(n), ta, tb, { registro: reg }); for (const x of reg) if (x[0] === 0 && x[1] !== "fim" && x[6]) { tot++; if (x[2] in em) em[x[2]]++; } }
  meta("esforco", G, "4-3-3: passos ganhos no 4e / 4d (% dos passos)", "os dois ocupados (≥ 4% cada)", `${pc(r(em["4e"], tot))} / ${pc(r(em["4d"], tot))}`, r(em["4e"], tot) >= 0.04 && r(em["4d"], tot) >= 0.04);
}

// time forte (nível 40) contra sorteados (nível 30): chutes, xG e toques na área por jogo
function timeForte(N) {
  const t = jogar(N, (n, rng) => { const fa = pega(rng, FORMACOES_BOT), fb = pega(rng, FORMACOES_BOT); return { fa, fb, a: onze(1000 + n, fa, 40), b: onze(9000 + n, fb) }; }, 17);
  const f = { chutes: 0, xg: 0, toques: 0, sofridos: 0 };
  for (const { eu, p } of t.rodadas) { const e = p.estat[eu]; f.chutes += e.finalizacoes; f.xg += e.xg; f.toques += e.grade.toquesArea; f.sofridos += p.estat[1 - eu].grade.toquesArea; }
  for (const k in f) f[k] /= t.jogos;
  return f;
}

function imprimir() {
  const larg = [12, 58, 32, 34];
  const linha = l => console.log(l.slice(0, 4).map((x, k) => String(x).padEnd(larg[k])).join(" ") + " " + l[4]);
  for (const [tipo, titulo] of [["obrigatoria", "OBRIGATÓRIAS"], ["esforco", "DE ESFORÇO"], ["info", "CONTADORES (sem meta)"]]) {
    if (!linhas[tipo].length) continue;
    console.log(`\n${titulo}`); linha(["grupo", "meta", "alvo", "medido", ""]);
    for (const l of linhas[tipo]) linha(l);
  }
  const fora = linhas.obrigatoria.filter(l => l[4] === "FORA");
  console.log(`\nobrigatórias fora: ${fora.length}/${linhas.obrigatoria.length}. Fora da régua (rodar à parte): sim_papeis_laterais, sim_valor_posicao.`);
  return fora.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const N = +process.argv[2] || 3000, grupo = process.argv[3] || null, todos = !grupo;
  const G = ["geral", "passe", "combinacoes", "finalizacao", "transicao", "aerea", "formacoes"];
  if (grupo && !G.includes(grupo)) { console.error(`grupo desconhecido: ${grupo} (${G.join(", ")})`); process.exit(2); }
  console.log(`T1 com a grade, ${N} jogos${grupo ? `, grupo ${grupo}` : ""}${process.env.GV ? `, GV ${process.env.GV}` : ""}`);
  const t = grupo === "formacoes" ? null : jogar(N);
  if (t) {
    geral(t);
    if (grupo) for (const l of ["esforco", "info"]) linhas[l] = linhas[l].filter(x => x[0] === grupo); // as obrigatórias saem sempre (efeito colateral)
    if (todos || grupo === "passe") passe(t);
    if (todos || grupo === "combinacoes") combinacoes(t);
    if (todos || grupo === "finalizacao") finalizacao(t, timeForte(Math.max(100, Math.round(N / 5))));
    if (todos || grupo === "transicao") transicao(t);
    if (todos || grupo === "aerea") aerea(t);
    if (todos) territorio(t);
  }
  if (todos || grupo === "formacoes") formacoes(Math.max(100, Math.round(N / 6)));
  process.exit(imprimir() ? 1 : 0);
}
