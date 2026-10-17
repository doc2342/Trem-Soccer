// Diretoria e confiança (desenho fechado em 16/10/2026, seção "Diretoria e confiança" do documento).
// Só dá recompensas: quem vai mal já é punido pela tabela. A meta de cada clube é uma faixa de posições tirada de simulações da temporada.
import { taticaBot } from "./bot.js";
import { prepararTime, simularPartida } from "./motor.js";
import { notaBruta } from "./modelo.js";

export const CONFIG_DIRETORIA = {
  inicio: 50, limite: 20,                          // confiança 0–100; muda no máximo 20 por virada
  acima: [10, 2, 15], dentro: 3, abaixo: [-8, -2, -15], // liga: base, por posição além da primeira, teto
  copaPorFase: 2, copaTeto: 5, semVermelho: 2, vermelho: -5,
  verba: [[85, 0.10], [70, 0.05]],                // fração do teto da divisão paga na virada
  multaExtra: 85, segundoClube: 80, simulacoes: 100,
};

const FRASES = [
  [80, "A diretoria está encantada: o seu nome é unanimidade no clube."],
  [60, "A diretoria está satisfeita com o trabalho."],
  [40, "A diretoria confia no trabalho, mas espera resultados."],
  [20, "A diretoria anda insatisfeita com a campanha."],
  [0, "A diretoria está perdendo a paciência."],
];
export const fraseDoPresidente = c => FRASES.find(([min]) => c >= min)[1];

// força do elenco: média das 11 melhores notas na posição de cada um (a mesma conta do técnico do ano)
export const forcaDoElenco = elenco => { const n = (elenco || []).map(j => notaBruta(j.at, j.pos)).sort((a, b) => b - a).slice(0, 11); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; };

// Meta sem simulação (primeira virada depois de ligar a diretoria): a posição pela força, com uma posição de folga para cada lado
export const metaPelaForca = (posForca, clubes) => [Math.max(1, posForca - 1), Math.min(clubes, posForca + 1)];

// Simula a temporada de liga n vezes (turno e returno, todos com tática de bot) e devolve a faixa central (25%–75%) de posições de cada clube.
// grupos: { g: [clube] }; elencos: { clubeId: [jogador] }. Lento de propósito (~4 ms por jogo): roda na tela do administrador, cedendo a vez ao navegador.
export async function simularMetas({ grupos, elencos, rng, n = CONFIG_DIRETORIA.simulacoes, aoProgresso = () => {} }) {
  const metas = [], total = Object.values(grupos).reduce((s, l) => s + l.length * (l.length - 1), 0) * n;
  let feitos = 0;
  for (const [g, clubes] of Object.entries(grupos)) {
    const forca = Object.fromEntries(clubes.map(c => [c.id, taticaBot(elencos[c.id] || []).forca]));
    const times = {}; // um time pronto por (clube, adversário, mando): a tática do bot depende do adversário
    const time = (c, adv, casa) => times[`${c.id}:${adv.id}:${casa}`] ||= (t => prepararTime({ nome: c.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: casa }))(
      taticaBot(elencos[c.id] || [], { mandante: casa, forcaAdversario: forca[adv.id], perfil: c.perfil }));
    const posicoes = Object.fromEntries(clubes.map(c => [c.id, []]));
    for (let s = 0; s < n; s++) {
      const pts = Object.fromEntries(clubes.map(c => [c.id, { p: 0, sg: 0, gp: 0 }]));
      for (const a of clubes) for (const b of clubes) {
        if (a === b) continue;
        const [x, y] = simularPartida(rng, time(a, b, true), time(b, a, false)).placar;
        pts[a.id].gp += x; pts[b.id].gp += y; pts[a.id].sg += x - y; pts[b.id].sg += y - x;
        if (x > y) pts[a.id].p += 3; else if (x < y) pts[b.id].p += 3; else { pts[a.id].p++; pts[b.id].p++; }
      }
      feitos += clubes.length * (clubes.length - 1);
      [...clubes].sort((a, b) => pts[b.id].p - pts[a.id].p || pts[b.id].sg - pts[a.id].sg || pts[b.id].gp - pts[a.id].gp || rng.n() - 0.5)
        .forEach((c, i) => posicoes[c.id].push(i + 1));
      if (s % 5 === 4) { aoProgresso(feitos / total, g); await new Promise(r => setTimeout(r, 0)); }
    }
    for (const c of clubes) { const l = posicoes[c.id].sort((a, b) => a - b), q = f => l[Math.min(l.length - 1, Math.floor(f * l.length))];
      metas.push({ clube_id: c.id, grupo: g, faixa_min: q(0.25), faixa_max: q(0.75) }); }
  }
  return metas;
}

// Copa: até que fase cada clube chegou (7 = campeão) e até qual "devia" chegar pela força.
// O k-ésimo mais forte entre os que jogaram a copa devia chegar à fase mais adiantada em que ainda havia pelo menos k clubes.
export function campanhaNaCopa(partidasDaCopa, forca) {
  const jogos = partidasDaCopa.filter(p => p.fase === "copa" && p.copa_fase > 0);
  if (!jogos.length) return {};
  const chegou = {}, naFase = {};
  for (const p of jogos) for (const id of [p.casa, p.fora]) { chegou[id] = Math.max(chegou[id] || 0, p.copa_fase); (naFase[p.copa_fase] ||= new Set()).add(id); }
  const final = jogos.find(p => p.copa_fase === 6 && p.vencedor); if (final) { chegou[final.vencedor] = 7; naFase[7] = new Set([final.vencedor]); }
  const fases = Object.keys(naFase).map(Number).sort((a, b) => a - b), ordem = Object.keys(chegou).map(Number).sort((a, b) => (forca[b] || 0) - (forca[a] || 0));
  return Object.fromEntries(ordem.map((id, i) => [id, { chegou: chegou[id], esperada: Math.max(fases[0], ...fases.filter(f => naFase[f].size >= i + 1)) }]));
}

// Quanto a confiança muda. avaliada: média da posição real e da posição pelos pontos esperados; faixa: [melhor, pior] posição da meta.
export function variacaoDaConfianca({ avaliada, faixa, copa = null, vermelho = false }) {
  const C = CONFIG_DIRETORIA, [a, b] = faixa;
  const fora = d => Math.max(0, Math.ceil(d) - 1);
  const liga = avaliada < a ? Math.min(C.acima[2], C.acima[0] + C.acima[1] * fora(a - avaliada))
    : avaliada > b ? Math.max(C.abaixo[2], C.abaixo[0] + C.abaixo[1] * fora(avaliada - b)) : C.dentro;
  const dCopa = copa ? Math.max(-C.copaTeto, Math.min(C.copaTeto, C.copaPorFase * (copa.chegou - copa.esperada))) : 0;
  const financas = vermelho ? C.vermelho : C.semVermelho;
  return { liga, copa: dCopa, financas, total: Math.max(-C.limite, Math.min(C.limite, liga + dCopa + financas)) };
}

// Posição de cada clube do grupo pelos pontos esperados (classificacao() de rodada.js já soma o "esp")
export const posicaoPelosEsperados = tab => Object.fromEntries([...tab].sort((x, y) => y.esp - x.esp).map((t, i) => [t.clube.id, i + 1]));

// ---------- conferência: abrir no console do navegador com import("./src/diretoria.js").then(m => m.conferir()) ----------
export function conferir() {
  const v = x => variacaoDaConfianca(x).total, ok = (c, m) => { if (!c) throw new Error(m); };
  ok(v({ avaliada: 5, faixa: [4, 7] }) === 5, "dentro da faixa: +3 da liga +2 das finanças");
  ok(v({ avaliada: 3, faixa: [4, 7] }) === 12, "uma acima: +10 +2");
  ok(v({ avaliada: 1, faixa: [4, 7] }) === 16, "três acima: +10 +2 +2 da liga, +2 das finanças");
  ok(v({ avaliada: 8.5, faixa: [4, 7] }) === -8, "uma e meia abaixo: −8 −2 +2");
  ok(v({ avaliada: 10, faixa: [1, 3], vermelho: true, copa: { chegou: 1, esperada: 6 } }) === -20, "tudo errado: limite −20");
  ok(fraseDoPresidente(50).includes("espera"), "frase do meio");
  const c = campanhaNaCopa([{ fase: "copa", copa_fase: 5, casa: 1, fora: 2 }, { fase: "copa", copa_fase: 6, casa: 1, fora: 3, vencedor: 3 }], { 1: 40, 2: 30, 3: 20 });
  ok(c[3].chegou === 7 && c[1].esperada === 7 && c[2].esperada === 6 && c[3].esperada === 5, "copa: o mais forte devia ser campeão");
  return "ok";
}
