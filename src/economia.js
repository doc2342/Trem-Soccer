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

// Regras do fim de temporada e do clube no vermelho (as mesmas do 18_fim_de_temporada.sql).
export const PREMIO_MINIMO = { 1: 4000, 2: 2400, 3: 1200 };        // prêmio do lanterna: é o que dá para antecipar
export const impostoDoLucro = (lucro, teto) => Math.max(0, Math.round(0.2 * (lucro - teto / 4)));
export const LIMITE_DA_DIVIDA = 0.10; // abaixo de 10% do teto no negativo...
export const RODADAS_DE_PRAZO = 3;    // ...3 rodadas para agir
export const valorNoBanco = salario => 3 * (salario || 0);          // 60% da cláusula
// Venda negociada: o valor fica entre 60% e 150% da multa rescisória (3 a 7,5 vezes o salário), como no 22_travas_da_negociacao.sql.
export const faixaDaNegociacao = salario => ({ minimo: 3 * (salario || 0), maximo: Math.round(7.5 * (salario || 0)) });
// 440 → "440 mil"; 1370 → "1,37 mi"
export const dinheiro = mil => mil == null ? "—" : Math.abs(mil) >= 1000 ? (mil / 1000).toFixed(2).replace(".", ",") + " mi" : mil + " mil";
