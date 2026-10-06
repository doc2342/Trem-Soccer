// Treino: cada sessão dá pontos aos atributos dos focos do jogador; a cada 100 pontos o atributo sobe 1.
// O foco principal fica com 70% dos pontos e o complementar (3 atributos à escolha) com 30%.
// O talento oculto define o teto da nota do jogador. A velocidade é proporcional ao CAMINHO dele (da nota de partida, igual para todos, até o teto):
// todo jogador percorre a mesma fração do caminho por temporada, então teto alto e teto baixo chegam na mesma idade. Sobre isso entram a idade,
// o centro de treinamento, o trabalho em equipe, ter jogado e os treinadores (cada atributo pertence a uma área de treino, e a qualidade da área
// depende de quem trabalha nela). Não há empurrão para quem está atrasado; há só um freio: ninguém anda mais rápido que a curva do melhor caso.
// Módulo puro: usado pela função do servidor (uma sessão por partida de liga) e pelas páginas (focos, sugestão e previsão).
import { ATRIBUTOS, ATR_MIN, ATR_MAX, IDX, POSICOES, PESOS, VIZINHAS, notaDeTeto } from "./modelo.js";

export const CONFIG_TREINO = {
  pontosPorNivel: 100,
  pontosPorSessao: 150,       // antes dos fatores; com tudo em 100% e caminho igual ao divisor, 1,5 ponto de atributo por sessão
  partePrincipal: 0.7,
  ct: [0.9, 0.04],            // sem centro de treinamento, 90%; cada nível soma 4% (110% no nível 5)
  equipe: [0.95, 1.05],       // do menor ao maior Trabalho em equipe
  bonusPorJogar: 0.1, minutosParaBonus: 45,
  teto: [23, 0.20],           // teto da nota = 23 + 0,20 × talento (1 a 100): de 23 a 43 (liga madura: titulares em 38 / 35 / 32 em A / B / C)
  // caminho: os pontos da sessão são multiplicados por (teto − partida) / divisor. Sem saber o teto (tela sem olheiro), vale o teto típico.
  caminho: { partida: 15, divisor: 26, minimo: 6, tetoTipico: 36 },
  // freio: fração do caminho que o melhor caso tem feito em cada idade; quem passa dela treina mais devagar (até o piso), nunca mais rápido
  freio: { curva: [[16, 0.05], [18, 0.36], [20, 0.62], [22, 0.82], [24, 0.96], [25, 1.03], [31, 1.06]], forca: 6, piso: 0.3 },
  // treinadores: a qualidade da área (0 a 50) vira um multiplicador dos pontos dos atributos dela
  treinador: [0.9, 0.25],     // área sem treinador, 90%; qualidade 50, 115%
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
// jogadores: quantos do elenco têm mais de 21 anos. O excesso só reduz o que os treinadores acrescentam: nenhuma área fica abaixo da base (área sem treinador).
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
// ritmo por idade: cheio até os 23, caindo até parar depois dos 30
export const ritmoDaIdade = idade => idade <= 23 ? 1 : idade <= 25 ? 0.85 : idade <= 27 ? 0.7 : idade <= 30 ? 0.5 : 0;

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

// Posição nova: o dirigente manda o jogador aprender UMA posição além das que ele já tem. Enquanto aprende, o treino de atributos rende 20% menos.
// Cada sessão dá pontos de posição; a posição vizinha de uma em que ele já é natural custa 1800 pontos por degrau (improvisado → competente → natural:
// perto de uma temporada cada) e a distante, o dobro. Jogar na posição acelera; a idade freia. Goleiro não aprende posição de linha, nem o contrário.
export const CONFIG_POSICAO = { custoDoTreino: 0.2, porSessao: 100, vizinha: 1800, distante: 3600, bonusPorJogar: 0.5 };
export const ritmoDaPosicao = idade => idade <= 23 ? 1 : idade <= 27 ? 0.7 : 0.4;
// posição que o jogador está aprendendo agora (nula quando não há, ou quando ele já virou natural nela)
export const posicaoEmEstudo = j => { const p = j.aprende && j.aprende.pos; return p && POSICOES[p] && p !== "GK" && j.pos !== "GK" && (j.fam || {})[p] !== "N" ? p : null; };
export const custoDaPosicao = (j, pos) => Object.keys(j.fam || {}).some(p => j.fam[p] === "N" && (VIZINHAS[p] || []).includes(pos)) ? CONFIG_POSICAO.vizinha : CONFIG_POSICAO.distante;
export const pontosDePosicao = (j, jogouNa = false) => Math.round(CONFIG_POSICAO.porSessao * ritmoDaPosicao(j.idade) * (jogouNa ? 1 + CONFIG_POSICAO.bonusPorJogar : 1));
// Uma sessão de estudo da posição. Devolve { fam, aprende } ou null (não está aprendendo nada).
export function aprenderPosicao(j, { jogouNa = false } = {}) {
  const pos = posicaoEmEstudo(j); if (!pos) return null;
  const custo = custoDaPosicao(j, pos), fam = { ...j.fam }; let pts = (+j.aprende.pts || 0) + pontosDePosicao(j, jogouNa);
  while (pts >= custo && fam[pos] !== "N") { pts -= custo; fam[pos] = fam[pos] === "C" ? "N" : "C"; }
  if (fam[pos] === "N") pts = 0;
  return { fam, aprende: { pos, pts } };
}
// quantas sessões faltam para o próximo degrau e para virar natural (sem jogar na posição)
export function prazoDaPosicao(j, pos, pts = 0) {
  const custo = custoDaPosicao(j, pos), porSessao = pontosDePosicao(j), degraus = (j.fam || {})[pos] === "C" ? 1 : 2;
  return { proximo: Math.max(1, Math.ceil((custo - pts) / porSessao)), natural: Math.max(1, Math.ceil((custo * degraus - pts) / porSessao)) };
}

export const tetoDaNota = tal => CONFIG_TREINO.teto[0] + CONFIG_TREINO.teto[1] * (tal == null ? 50 : tal);

// Fração do caminho que o melhor caso tem feito na idade (interpolação da curva do freio). A idade é contada no meio da temporada.
export function alvoDaIdade(idade) {
  const c = CONFIG_TREINO.freio.curva, a = idade + 0.5;
  if (a <= c[0][0]) return c[0][1];
  for (let k = 1; k < c.length; k++) if (a <= c[k][0]) return c[k - 1][1] + (c[k][1] - c[k - 1][1]) * (a - c[k - 1][0]) / (c[k][0] - c[k - 1][0]);
  return c[c.length - 1][1];
}
// Multiplicador do caminho: proporcional ao tamanho do caminho do jogador e freado quando ele está adiante da curva. teto: o teto da nota.
export function fatorDoCaminho(j, teto) {
  const C = CONFIG_TREINO, cam = Math.max(C.caminho.minimo, teto - C.caminho.partida), feito = (notaDeTeto(j) - C.caminho.partida) / cam;
  return cam / C.caminho.divisor * Math.max(C.freio.piso, Math.min(1, 1 + C.freio.forca * (alvoDaIdade(j.idade) - feito)));
}
// Pontos de uma sessão para o jogador, antes de dividir pelos focos. tal: talento (só o servidor sabe); teto: estimativa do teto, para as telas
// (meio da faixa do olheiro). Sem nenhum dos dois, a conta usa o teto típico e serve só de referência.
export function pontosDaSessao(j, { ct = 0, jogou = false, tal = null, teto = null } = {}) {
  const C = CONFIG_TREINO, equ = (j.at[IDX.equ] - ATR_MIN) / (ATR_MAX - ATR_MIN);
  return C.pontosPorSessao * ritmoDaIdade(j.idade) * (C.ct[0] + C.ct[1] * (ct || 0)) * (C.equipe[0] + (C.equipe[1] - C.equipe[0]) * equ) * (jogou ? 1 + C.bonusPorJogar : 1)
    * (posicaoEmEstudo(j) ? 1 - CONFIG_POSICAO.custoDoTreino : 1)
    * fatorDoCaminho(j, teto != null ? teto : tal != null ? tetoDaNota(tal) : C.caminho.tetoTipico);
}
// Quanto de cada sessão vai para cada atributo: { índice: fração }. Atributo cheio (50) passa a vez aos outros do foco; com o foco todo cheio,
// os pontos vão para os demais atributos que pesam na posição, na proporção do peso.
export function partilha(j) {
  const f = focoDoJogador(j), C = CONFIG_TREINO, principal = FOCOS[f.p].at.map(k => IDX[k]), comp = f.c.filter(i => !principal.includes(i));
  const bruta = {}, pp = comp.length ? C.partePrincipal : 1;
  principal.forEach(i => { bruta[i] = pp / principal.length; });
  comp.forEach(i => { bruta[i] = (1 - pp) / comp.length; });
  const vivos = Object.entries(bruta).filter(([i]) => j.at[i] < ATR_MAX);
  if (vivos.length === Object.keys(bruta).length) return bruta;
  const partes = {}, soma = vivos.reduce((t, [, v]) => t + v, 0);
  if (soma > 0) { vivos.forEach(([i, v]) => { partes[i] = v / soma; }); return partes; }
  const pesos = PESOS[(POSICOES[j.pos] || {}).papel] || {}, resto = Object.keys(pesos).filter(k => j.at[IDX[k]] < ATR_MAX && treinavel(j.pos, IDX[k]));
  const total = resto.reduce((t, k) => t + pesos[k], 0);
  resto.forEach(k => { partes[IDX[k]] = pesos[k] / total; });
  return partes;
}

// Uma sessão de treino. j: { idade, pos, at, treino, pts }. tal: talento oculto (só o servidor sabe).
// areas: multiplicadores de qualidadeDoTreino (sem eles, tudo 100%).
// Devolve { at, pts, subiu: [índices] } quando algo mudou, ou null (velho demais, ou já no teto).
export function treinar(j, { tal = null, ct = 0, jogou = false, areas = null } = {}) {
  const total = pontosDaSessao(j, { ct, jogou, tal });
  if (total <= 0 || notaDeTeto(j) >= tetoDaNota(tal)) return null;
  const at = j.at.slice(), pts = ATRIBUTOS.map((_, i) => (j.pts && j.pts[i]) || 0), subiu = [], C = CONFIG_TREINO;
  for (const [i, parte] of Object.entries(partilha(j))) {
    if (at[i] >= ATR_MAX) continue;
    pts[i] += Math.round(total * parte * multDoAtributo(areas, i));
    while (pts[i] >= C.pontosPorNivel && at[i] < ATR_MAX) { pts[i] -= C.pontosPorNivel; at[i]++; subiu.push(+i); }
    if (at[i] >= ATR_MAX) pts[i] = 0;
  }
  return { at, pts, subiu };
}
