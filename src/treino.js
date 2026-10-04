// Treino (etapa T1, ainda sem treinadores): cada sessão dá pontos aos atributos dos focos do jogador; a cada 100 pontos o atributo sobe 1.
// O foco principal fica com 70% dos pontos e o complementar (3 atributos à escolha) com 30%.
// O talento oculto define o teto da nota do jogador; a velocidade vem da idade, do centro de treinamento, do trabalho em equipe e de ter jogado.
// Módulo puro: usado pela função do servidor (uma sessão por partida de liga) e pelas páginas (focos, sugestão e previsão).
import { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, notaBruta } from "./modelo.js";

export const CONFIG_TREINO = {
  pontosPorNivel: 100,
  pontosPorSessao: 150,       // antes dos fatores; com tudo em 100%, 1,5 ponto de atributo por sessão (alvo: 25 a 30 por temporada para um jovem)
  partePrincipal: 0.7,
  ct: [0.8, 0.08],            // sem centro de treinamento, 80%; cada nível soma 8%
  equipe: [0.85, 1.15],       // do menor ao maior Trabalho em equipe
  bonusPorJogar: 0.2, minutosParaBonus: 45,
  teto: [24, 0.22],           // teto da nota = 24 + 0,22 × talento (1 a 100): de 24 a 46
};
// ritmo por idade (a testar): cheio até os 21, caindo até parar depois dos 30
export const ritmoDaIdade = idade => idade <= 21 ? 1 : idade <= 23 ? 0.85 : idade <= 25 ? 0.6 : idade <= 27 ? 0.35 : idade <= 30 ? 0.15 : 0;

// Focos principais: os atributos de cada função.
export const FOCOS = {
  goleiro: { nome: "Goleiro", at: ["ref", "um", "enc", "com", "pos"] },
  zagueiro: { nome: "Zagueiro", at: ["des", "mar", "cab", "pos", "com"] },
  lateral: { nome: "Lateral e ala", at: ["des", "mar", "pos", "com", "cru"] },
  volante: { nome: "Volante", at: ["pas", "mar", "des", "pos", "cri"] },
  meia: { nome: "Meia", at: ["pas", "cri", "pos", "dom", "lon"] },
  ponta: { nome: "Ponta", at: ["fin", "cru", "dri", "pos", "dom"] },
  atacante: { nome: "Atacante", at: ["fin", "cab", "dri", "pos", "dom"] },
  fisico: { nome: "Físico", at: ["vel", "for", "res"] },
};
const FOCO_DA_LINHA = { gol: "goleiro", defesa: "zagueiro", ala: "lateral", volante: "volante", meio: "meia", meia: "meia", ataque: "atacante" };
export function focoDaPosicao(pos) {
  const p = POSICOES[pos]; if (!p) return "meia";
  if (p.linha === "defesa" && p.lado !== "C") return "lateral";
  if (p.lado !== "C" && (p.linha === "meio" || p.linha === "meia" || p.linha === "ataque")) return "ponta";
  return FOCO_DA_LINHA[p.linha] || "meia";
}
// atributos que o jogador pode treinar: os de goleiro só para goleiro
export const treinavel = (pos, i) => ATRIBUTOS[i].grupo !== "gol" || pos === "GK";
// Foco automático: a função da posição e, como complemento, os 3 atributos que mais pesam na posição e não estão no foco principal.
export function focoAutomatico(pos) {
  const p = focoDaPosicao(pos), doFoco = new Set(FOCOS[p].at), pesos = PESOS[(POSICOES[pos] || {}).papel] || {};
  const c = Object.keys(pesos).filter(k => !doFoco.has(k) && treinavel(pos, IDX[k])).sort((a, b) => pesos[b] - pesos[a]).slice(0, 3).map(k => IDX[k]);
  for (const k of ["vel", "for", "res", "equ"]) if (c.length < 3 && !doFoco.has(k) && !c.includes(IDX[k])) c.push(IDX[k]);
  return { p, c };
}
// Foco em uso: o salvo pelo dirigente, se for válido; senão, o automático.
export function focoDoJogador(j) {
  const t = j.treino, auto = focoAutomatico(j.pos);
  // goleiro só treina o foco de goleiro ou o físico; jogador de linha não treina o foco de goleiro
  if (!t || !FOCOS[t.p] || ((t.p === "goleiro") !== (j.pos === "GK") && t.p !== "fisico")) return auto;
  const c = Array.isArray(t.c) ? [...new Set(t.c.map(Number))].filter(i => i >= 0 && i < ATRIBUTOS.length && treinavel(j.pos, i)).slice(0, 3) : [];
  return { p: t.p, c: c.length ? c : auto.c };
}

export const tetoDaNota = tal => CONFIG_TREINO.teto[0] + CONFIG_TREINO.teto[1] * (tal == null ? 50 : tal);

// Pontos de uma sessão para o jogador, antes de dividir pelos focos.
export function pontosDaSessao(j, { ct = 0, jogou = false } = {}) {
  const C = CONFIG_TREINO, equ = (j.at[IDX.equ] - ATR_MIN) / (ATR_MAX - ATR_MIN);
  return C.pontosPorSessao * ritmoDaIdade(j.idade) * (C.ct[0] + C.ct[1] * (ct || 0)) * (C.equipe[0] + (C.equipe[1] - C.equipe[0]) * equ) * (jogou ? 1 + C.bonusPorJogar : 1);
}
// Quanto de cada sessão vai para cada atributo: { índice: fração }.
export function partilha(j) {
  const f = focoDoJogador(j), C = CONFIG_TREINO, principal = FOCOS[f.p].at.map(k => IDX[k]), comp = f.c.filter(i => !principal.includes(i));
  const partes = {}, pp = comp.length ? C.partePrincipal : 1;
  principal.forEach(i => { partes[i] = pp / principal.length; });
  comp.forEach(i => { partes[i] = (1 - pp) / comp.length; });
  return partes;
}

// Uma sessão de treino. j: { idade, pos, at, treino, pts }. tal: talento oculto (só o servidor sabe).
// Devolve { at, pts, subiu: [índices] } quando algo mudou, ou null (velho demais, ou já no teto).
export function treinar(j, { tal = null, ct = 0, jogou = false } = {}) {
  const total = pontosDaSessao(j, { ct, jogou });
  if (total <= 0 || notaBruta(j.at, j.pos) >= tetoDaNota(tal)) return null;
  const at = j.at.slice(), pts = ATRIBUTOS.map((_, i) => (j.pts && j.pts[i]) || 0), subiu = [], C = CONFIG_TREINO;
  for (const [i, parte] of Object.entries(partilha(j))) {
    if (at[i] >= ATR_MAX) continue;
    pts[i] += Math.round(total * parte);
    while (pts[i] >= C.pontosPorNivel && at[i] < ATR_MAX) { pts[i] -= C.pontosPorNivel; at[i]++; subiu.push(+i); }
    if (at[i] >= ATR_MAX) pts[i] = 0;
  }
  return { at, pts, subiu };
}
