// Grade 5×5 do motor (regras da T1): 5 faixas (1 = saída de bola … 5 = ataque) × 5 corredores
// (E lado esquerdo, e meio-espaço esquerdo, C centro, d meio-espaço direito, D lado direito),
// sempre do ponto de vista do time que ocupa a zona. Código: dígito da faixa + letra do corredor ("1E" … "5D").
// O dígito nunca colide com os códigos de 9 zonas ("DE" … "AD"), que seguem valendo na T0.
import { IDX } from "./modelo.js";

export const CORREDORES = ["E", "e", "C", "d", "D"];
export const ZONAS_GRADE = [1, 2, 3, 4, 5].flatMap(f => CORREDORES.map(c => f + c));

export function ehGrade(z) { return z[0] >= "1" && z[0] <= "5"; }
export function faixaDe(z) { return +z[0]; }
export function corredorDe(z) { return z[1]; }
export function colunaDe(z) { return CORREDORES.indexOf(z[1]); }

// A faixa k de quem ataca enfrenta a faixa 6−k de quem defende, e o corredor troca de lado.
export function espelhoGrade(z) { return (6 - faixaDe(z)) + CORREDORES[4 - colunaDe(z)]; }

// Linha e lado "antigos" (9 zonas) de uma zona: faixa 1 → D, 2–3 → M, 4–5 → A; meio-espaço e centro → C.
// Com código de 9 zonas, devolve o próprio z[0]/z[1].
export function linhaDaZona(z) { return ehGrade(z) ? "DMMAA"[faixaDe(z) - 1] : z[0]; }
export function ladoDaZona(z) { return ehGrade(z) ? ({ E: "E", D: "D" })[z[1]] || "C" : z[1]; }

export function vizinhas(z) {
  const f = faixaDe(z), c = colunaDe(z), r = [];
  for (let df = -1; df <= 1; df++) for (let dc = -1; dc <= 1; dc++) {
    if ((df || dc) && f + df >= 1 && f + df <= 5 && c + dc >= 0 && c + dc <= 4) r.push((f + df) + CORREDORES[c + dc]);
  }
  return r;
}

const NOME_FAIXA = ["na saída de bola", "na faixa dos volantes", "no meio-campo", "na faixa do meia ofensivo", "na entrada da área"];
const NOME_LADO = ["a saída de bola pela", "o lado $ na faixa dos volantes", "o meio-campo pela", "o lado $ na faixa do meia ofensivo", "o fundo pela"];
const NOME_CENTRO = ["a saída de bola pelo meio", "o meio, na frente dos volantes", "o meio-campo pelo centro", "a zona 14", "a entrada da área"];

// Nome para a narração e o analista, visto por quem ataca. deQuem = "defesa": z está nas coordenadas de quem defende.
export function nomeDaZona(z, deQuem = "ataque") {
  if (deQuem === "defesa") z = espelhoGrade(z);
  const f = faixaDe(z) - 1, c = corredorDe(z);
  if (c === "C") return NOME_CENTRO[f];
  if (c === "e" || c === "d") return "o meio-espaço " + (c === "e" ? "esquerdo " : "direito ") + NOME_FAIXA[f];
  const lado = c === "E" ? "esquerda" : "direita", n = NOME_LADO[f];
  return n.includes("$") ? n.replace("$", lado === "esquerda" ? "esquerdo" : "direito") : n + " " + lado;
}

// Soma um mapa de 25 zonas em 9: faixas 1 → D, 2–3 → M, 4–5 → A; corredor E → E, D → D, C → C,
// meio-espaço metade para o lado e metade para o C. Vale para números e para pares [ganhos, perdidos] (estat.zonas).
export function paraNoveZonas(mapa25) {
  const r = {};
  const somar = (k, v, p) => {
    if (Array.isArray(v)) { r[k] = r[k] || v.map(() => 0); v.forEach((x, i) => { r[k][i] += x * p; }); }
    else r[k] = (r[k] || 0) + v * p;
  };
  for (const [z, v] of Object.entries(mapa25)) {
    const l = linhaDaZona(z), c = corredorDe(z);
    if (c === "e" || c === "d") { somar(l + (c === "e" ? "E" : "D"), v, 0.5); somar(l + "C", v, 0.5); }
    else somar(l + c, v, 1);
  }
  return r;
}

// Quem decide o passo: Criatividade e Trabalho em equipe.
export function decisao(at) { return (at[IDX.cri] + at[IDX.equ]) / 2; }

// Manchas: quanto de cada jogador fica em cada zona, sem e com a bola (lado direito; o esquerdo é o espelho).
// Rascunho aprovado em .superpowers/brainstorm/29-1793397721/content/manchas-v2.html, números de partida (a calibragem ajusta).
// Zagueiros, volantes e atacantes repetidos têm a versão da dupla ("2d", o da direita) e do trio.
export const MANCHAS = {
  DC1: { sem: { "1C": 0.6, "1e": 0.12, "1d": 0.12, "2C": 0.16 }, com: { "1C": 0.55, "1e": 0.15, "1d": 0.15, "2C": 0.15 } },
  DC2d: { sem: { "1d": 0.4, "1C": 0.35, "1D": 0.05, "2d": 0.1, "2C": 0.1 }, com: { "1d": 0.55, "1C": 0.15, "1D": 0.1, "2d": 0.15, "2C": 0.05 } },
  DC3c: { sem: { "1C": 0.65, "1e": 0.1, "1d": 0.1, "2C": 0.15 }, com: { "1C": 0.6, "1e": 0.1, "1d": 0.1, "2C": 0.2 } },
  DC3d: { sem: { "1d": 0.45, "1D": 0.2, "1C": 0.15, "2d": 0.1, "2D": 0.1 }, com: { "1d": 0.4, "1D": 0.25, "2d": 0.2, "2D": 0.1, "1C": 0.05 } },
  SW: { sem: { "1C": 0.5, "1e": 0.15, "1d": 0.15, "2C": 0.2 }, com: { "1C": 0.35, "2C": 0.35, "2e": 0.1, "2d": 0.1, "3C": 0.1 } },
  DR: { sem: { "1D": 0.55, "1d": 0.15, "2D": 0.25, "3D": 0.05 }, com: { "1D": 0.35, "2D": 0.3, "3D": 0.25, "1d": 0.05, "4D": 0.05 } },
  WBR: { sem: { "1D": 0.35, "2D": 0.45, "3D": 0.15, "1d": 0.05 }, com: { "2D": 0.25, "3D": 0.35, "4D": 0.3, "1D": 0.1 } },
  DMC1: { sem: { "2C": 0.45, "1C": 0.2, "2e": 0.1, "2d": 0.1, "3C": 0.15 }, com: { "2C": 0.5, "3C": 0.2, "1C": 0.15, "2e": 0.075, "2d": 0.075 } },
  DMC2d: { sem: { "2d": 0.4, "2C": 0.25, "1d": 0.1, "1C": 0.1, "3d": 0.15 }, com: { "2d": 0.45, "2C": 0.15, "3d": 0.25, "3C": 0.1, "1d": 0.05 } },
  MC1: { sem: { "3C": 0.5, "3e": 0.1, "3d": 0.1, "2C": 0.15, "4C": 0.15 }, com: { "3C": 0.45, "3e": 0.1, "3d": 0.1, "2C": 0.1, "4C": 0.25 } },
  MC2d: { sem: { "3d": 0.45, "3C": 0.2, "3D": 0.05, "2d": 0.15, "4d": 0.15 }, com: { "3d": 0.4, "3C": 0.15, "2d": 0.1, "4d": 0.3, "3D": 0.05 } },
  AMC: { sem: { "4C": 0.45, "3C": 0.35, "4e": 0.1, "4d": 0.1 }, com: { "4C": 0.45, "4e": 0.1, "4d": 0.1, "5C": 0.15, "3C": 0.2 } },
  // o AMC com o peso do 4C passado para o 4d e o do 4e dividido entre 4d e 4C (caixa do Pep, árvore de Natal)
  AMC2d: { sem: { "4d": 0.6, "4C": 0.05, "3C": 0.35 }, com: { "4d": 0.6, "4C": 0.05, "5C": 0.15, "3C": 0.2 } },
  MR: { sem: { "3D": 0.5, "2D": 0.15, "3d": 0.15, "4D": 0.2 }, com: { "3D": 0.35, "4D": 0.4, "5D": 0.1, "3d": 0.15 } },
  AMR: { sem: { "4D": 0.5, "3D": 0.35, "4d": 0.15 }, com: { "4D": 0.45, "4d": 0.25, "5D": 0.15, "3D": 0.15 } },
  RW: { sem: { "4D": 0.45, "3D": 0.25, "5D": 0.2, "4d": 0.1 }, com: { "5D": 0.45, "4D": 0.3, "5d": 0.15, "4d": 0.1 } },
  FC1: { sem: { "5C": 0.45, "4C": 0.35, "5e": 0.05, "5d": 0.05, "3C": 0.1 }, com: { "5C": 0.6, "4C": 0.2, "5e": 0.1, "5d": 0.1 } },
  SC1: { sem: { "5C": 0.7, "4C": 0.25, "3C": 0.05 }, com: { "5C": 0.85, "5e": 0.05, "5d": 0.05, "4C": 0.05 } },
  FC2d: { sem: { "5d": 0.35, "4d": 0.35, "4C": 0.15, "3d": 0.15 }, com: { "5d": 0.45, "5C": 0.2, "4d": 0.25, "5D": 0.1 } },
  SC2d: { sem: { "5d": 0.55, "5C": 0.25, "4d": 0.2 }, com: { "5d": 0.6, "5C": 0.3, "5D": 0.1 } },
  FC3d: { sem: { "5d": 0.35, "5D": 0.2, "4d": 0.3, "4D": 0.15 }, com: { "5d": 0.45, "5D": 0.25, "4d": 0.2, "5C": 0.1 } },
};

// troca o corredor de cada chave (lado direito ↔ esquerdo), sem mudar a faixa
export function espelharGrade(mapa) {
  return Object.fromEntries(Object.entries(mapa).map(([z, w]) => [z[0] + CORREDORES[4 - colunaDe(z)], w]));
}
const espelhada = m => ({ com: espelharGrade(m.com), sem: espelharGrade(m.sem) });

// posições de lado: a do lado esquerdo usa o espelho da direita
const LADO = { DR: "DR", WBR: "WBR", MR: "MR", AMR: "AMR", RW: "RW", DL: "DR", WBL: "WBR", ML: "MR", AML: "AMR", LW: "RW" };
const FAMILIA = { DC: "zaga", SW: "zaga", DMC: "volante", MC: "meio", AMC: "meia", FC: "ataque", SC: "ataque" };
// variante de cada posição por quantos da família há: [sozinho, da dupla, do centro do trio]
const VARIANTE = {
  DC: ["DC1", "DC2d", "DC3c"], SW: ["SW", "DC2d", "DC3c"], DMC: ["DMC1", "DMC2d", "DMC1"], MC: ["MC1", "MC2d", "MC1"],
  AMC: ["AMC", "AMC2d", "AMC"], FC: ["FC1", "FC2d", "FC1"], SC: ["SC1", "SC2d", "SC1"],
};
// no trio, quem fica no meio-espaço usa a versão de lado do trio quando existe
const DE_LADO_DO_TRIO = { DC: "DC3d", SW: "DC3d", FC: "FC3d", SC: "FC3d" };

// { com, sem } de cada jogador, na ordem da escalação (null no goleiro). Por família: 1 no centro; 2 um em cada meio-espaço
// (o primeiro da escalação no direito, o segundo no esquerdo); 3 meio-espaço direito / centro / meio-espaço esquerdo.
// ponytail: ordem da escalação decide o lado; trocar pelo pé dominante se a calibragem pedir. 4 ou mais: os que passam de 3 repetem o centro.
export function manchasDoTime(escalacao) {
  const n = {}, i = {};
  for (const j of escalacao) if (FAMILIA[j.pos]) n[FAMILIA[j.pos]] = (n[FAMILIA[j.pos]] || 0) + 1;
  return escalacao.map(j => {
    if (LADO[j.pos]) return j.pos === LADO[j.pos] ? MANCHAS[j.pos] : espelhada(MANCHAS[LADO[j.pos]]);
    const f = FAMILIA[j.pos];
    if (!f) return null;
    const k = i[f] = (i[f] || 0) + 1, total = n[f], v = VARIANTE[j.pos];
    if (total === 1) return MANCHAS[v[0]];
    if (total === 2) return k === 1 ? MANCHAS[v[1]] : espelhada(MANCHAS[v[1]]);
    if (k === 2 || k > 3) return MANCHAS[v[2]];
    const m = MANCHAS[DE_LADO_DO_TRIO[j.pos] || v[1]];
    return k === 1 ? m : espelhada(m);
  });
}
