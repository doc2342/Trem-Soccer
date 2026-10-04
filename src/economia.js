// Economia: salários, cláusula e contratos. Valores em milhares por temporada.
import { melhorPosicao } from "./modelo.js";

export const MULTIPLO_DA_CLAUSULA = 5;   // cláusula de saída = 5 vezes o salário da temporada
export const MAXIMO_INDIVIDUAL = 0.15;   // um jogador ganha no máximo 15% do teto de folha
export const MAXIMO_DE_TEMPORADAS = 3;

// O mínimo que o jogador aceita: cresce 12% a cada ponto de nota; jovem pede 20% menos e veterano 10% menos.
// Nota 25 → 250 mil; 30 → 440 mil; 35 → 780 mil; 40 → 1,37 mi; 45 → 2,4 mi.
export function salarioDeMercado(j) {
  const nota = melhorPosicao(j).nota, idade = j.idade <= 21 ? 0.8 : j.idade >= 31 ? 0.9 : 1;
  return Math.max(50, Math.round(250 * Math.pow(1.12, nota - 25) * idade / 5) * 5);
}
export const clausula = salario => salario * MULTIPLO_DA_CLAUSULA;

// Contrato inicial de um jogador gerado: salário de mercado, duração sorteada de 1 a 3 temporadas (contando a atual)
// e proteção contra a cláusula até o fim da primeira temporada.
export function contratoInicial(rng, j, temporada) {
  const mercado = salarioDeMercado(j);
  return { salario: mercado, mercado, contrato_ate: temporada + rng.int(0, 2), protegido_ate: temporada };
}

// 440 → "440 mil"; 1370 → "1,37 mi"
export const dinheiro = mil => mil == null ? "—" : Math.abs(mil) >= 1000 ? (mil / 1000).toFixed(2).replace(".", ",") + " mi" : mil + " mil";
