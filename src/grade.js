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
