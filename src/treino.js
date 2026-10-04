// Treino: cada sessão dá pontos aos atributos dos focos do jogador; a cada 100 pontos o atributo sobe 1.
// O foco principal fica com 70% dos pontos e o complementar (3 atributos à escolha) com 30%.
// O talento oculto define o teto da nota do jogador; a velocidade vem da idade, do centro de treinamento, do trabalho em equipe, de ter jogado
// e dos treinadores (etapa T2): cada atributo pertence a uma área de treino, e a qualidade da área depende de quem trabalha nela.
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
  // treinadores: a qualidade da área (0 a 50) vira um multiplicador dos pontos dos atributos dela
  treinador: [0.8, 0.5],      // área sem treinador, 80%; qualidade 50, 130%
  parteDoGeral: 0.4,          // treinador "geral" vale 40% de cada skill nas quatro áreas com treinador designado
  coletivas: ["fis", "tat"], divisorDaSoma: 2.5, // físico e tática: soma da skill de TODOS os treinadores, dividida por 2,5 (teto 50)
  // perdaPorExcesso em 0: a punição por elenco inflado (mais de 7 jogadores acima de 21 anos por treinador) foi desligada
  // quando o elenco ganhou o limite de 35 jogadores com mais de 21 anos; para religar, voltar a 0.1
  maximoDeTreinadores: 5, jogadoresPorTreinador: 7, perdaPorExcesso: 0,
  idadeSemContar: 21,         // jogador até esta idade não entra no limite de 35 do elenco
  qualidadeSemDono: 20,       // clube sem dono treina como se tivesse qualidade 20 em tudo (100%)
};

// Áreas de treino e os atributos de cada uma. Goleiros, defesa, meio e ataque têm treinador designado; físico e tática são coletivas.
export const AREAS = {
  gol: { nome: "Goleiros", at: ["ref", "um", "enc"] },
  def: { nome: "Defesa", at: ["des", "mar", "cab"] },
  mei: { nome: "Meio", at: ["pas", "cri", "dom", "cru"] },
  ata: { nome: "Ataque", at: ["fin", "lon", "dri"] },
  fis: { nome: "Físico", at: ["vel", "for", "res"] },
  tat: { nome: "Tática", at: ["com", "pos", "equ", "agr", "inf", "exc"] },
};
export const AREA_DO_ATRIBUTO = ATRIBUTOS.map(a => Object.keys(AREAS).find(k => AREAS[k].at.includes(a.k)) || "tat");
const multDaQualidade = q => CONFIG_TREINO.treinador[0] + CONFIG_TREINO.treinador[1] * Math.min(50, Math.max(0, q)) / 50;
// Multiplicador de cada área para um clube. treinadores: [{ area, skills }] (só os contratados); null = sem o sistema de treinadores (tudo 100%).
// jogadores: quantos do elenco têm mais de 21 anos. O excesso só reduz o que os treinadores acrescentam: nenhuma área fica abaixo da base de 80%.
export function qualidadeDoTreino(treinadores, jogadores, semDono = false) {
  const C = CONFIG_TREINO, areas = {};
  if (!treinadores) { for (const k in AREAS) areas[k] = 1; return areas; }
  if (semDono) { for (const k in AREAS) areas[k] = multDaQualidade(C.qualidadeSemDono); return areas; }
  const lista = treinadores.slice(0, C.maximoDeTreinadores), capacidade = lista.length * C.jogadoresPorTreinador;
  const excesso = capacidade && jogadores > capacidade ? 1 - C.perdaPorExcesso * Math.min(1, (jogadores - capacidade) / capacidade) : 1;
  for (const k in AREAS) {
    const q = C.coletivas.includes(k) ? lista.reduce((s, t) => s + (t.skills[k] || 0), 0) / C.divisorDaSoma
      : lista.reduce((m, t) => Math.max(m, t.area === k ? (t.skills[k] || 0) : t.area === "geral" ? C.parteDoGeral * (t.skills[k] || 0) : 0), 0);
    areas[k] = C.treinador[0] + (multDaQualidade(q) - C.treinador[0]) * excesso;
  }
  return areas;
}
export const multDoAtributo = (areas, i) => areas ? (areas[AREA_DO_ATRIBUTO[i]] || 1) : 1;
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
// areas: multiplicadores de qualidadeDoTreino (sem eles, tudo 100%).
// Devolve { at, pts, subiu: [índices] } quando algo mudou, ou null (velho demais, ou já no teto).
export function treinar(j, { tal = null, ct = 0, jogou = false, areas = null } = {}) {
  const total = pontosDaSessao(j, { ct, jogou });
  if (total <= 0 || notaBruta(j.at, j.pos) >= tetoDaNota(tal)) return null;
  const at = j.at.slice(), pts = ATRIBUTOS.map((_, i) => (j.pts && j.pts[i]) || 0), subiu = [], C = CONFIG_TREINO;
  for (const [i, parte] of Object.entries(partilha(j))) {
    if (at[i] >= ATR_MAX) continue;
    pts[i] += Math.round(total * parte * multDoAtributo(areas, i));
    while (pts[i] >= C.pontosPorNivel && at[i] < ATR_MAX) { pts[i] -= C.pontosPorNivel; at[i]++; subiu.push(+i); }
    if (at[i] >= ATR_MAX) pts[i] = 0;
  }
  return { at, pts, subiu };
}
