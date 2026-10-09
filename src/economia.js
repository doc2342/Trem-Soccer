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
// Valor de hoje do jogador: o maior entre o salário do contrato, o salário de mercado gravado e o de mercado pela nota atual.
// A multa rescisória e o salário mínimo de quem compra pela multa partem dele (66_multa_e_bots.sql).
export const valorDeHoje = j => Math.max(j.salario || 0, j.salario_mercado || j.mercado || 0, j.at ? salarioDeMercado(j) : 0);
export const multaDe = j => clausula(valorDeHoje(j));
// Contrato mais longo pede mais: 2 temporadas, salário de mercado + 10%; 3 temporadas, + 20% (52_pacote_da_economia.sql).
export const ADICIONAL_POR_TEMPORADA = 0.1;
export const minimoPelaDuracao = (mercado, temporadas) => Math.round((mercado || 0) * (1 + ADICIONAL_POR_TEMPORADA * (Math.max(1, temporadas) - 1)));
// Luvas (68_economia.sql): na renovação, o clube paga de uma vez, fora da folha, para o jogador aceitar um salário menor que o pedido.
// Cada mil a menos por temporada custa 1,5 mil de luvas por temporada de contrato, e o salário fica em no mínimo 70% do pedido.
export const LUVAS = { fator: 1.5, piso: 0.7 };
export const salarioMinimoComLuvas = pede => Math.round(pede * LUVAS.piso);
export const luvasDaRenovacao = (pede, salario, temporadas) => Math.max(0, Math.ceil((pede - salario) * LUVAS.fator * Math.max(1, temporadas)));
// Manutenção por temporada (68_economia.sql): 20% do que foi gasto nas quatro estruturas e 4% do que foi gasto no estádio (era 10% e 2%)
export const MANUTENCAO = { estruturas: 0.2, estadio: 0.04 };
// Estádio: níveis 1 a 5 de 10 a 30 mil lugares; 6, 7 e 8 com 40, 50 e 60 mil (55_estadio_torcida_e_publico.sql)
export const NIVEL_MAXIMO_DO_ESTADIO = 8;
export const lugaresDoEstadio = nivel => { const n = Math.max(1, nivel || 1); return n <= 5 ? 5000 + 5000 * n : [40000, 50000, 60000][Math.min(8, n) - 6]; };
// Prestígio (clubes.torcida_fator): multiplica a torcida-base da divisão; a torcida oscila entre 80% e 140% do resultado
export const PRESTIGIO_MAXIMO = 2.15;
// Teto de folha por divisão (em milhares por temporada), para quem não lê a tabela de divisões
export const TETO_DE_FOLHA = { 1: 20000, 2: 14000, 3: 10000 };

// Contrato inicial de um jogador gerado: salário de mercado, duração sorteada de 1 a 3 temporadas (contando a atual)
// e proteção contra a cláusula até o fim da primeira temporada.
export function contratoInicial(rng, j, temporada) {
  const mercado = salarioDeMercado(j);
  return { salario: mercado, mercado, contrato_ate: temporada + rng.int(0, 2), protegido_ate: temporada };
}

// Regras do fim de temporada e do clube no vermelho (as mesmas do 18_fim_de_temporada.sql).
export const PREMIO_MINIMO = { 1: 2000, 2: 1200, 3: 600 };         // prêmio do lanterna: é o que dá para antecipar (o mesmo de PREMIOS em virada.js)
export const impostoDoLucro = (lucro, teto) => Math.max(0, Math.round(0.2 * (lucro - teto / 4)));
export const LIMITE_DA_DIVIDA = 0.10; // abaixo de 10% do teto no negativo...
export const RODADAS_DE_PRAZO = 3;    // ...3 rodadas para agir
export const valorNoBanco = salario => 3 * (salario || 0);          // clube no vermelho: o agente paga 3 vezes o salário de mercado
export const VENDAS_PELO_AGENTE = 4;                                // por temporada, fora do vermelho
// O agente paga com o caixa dos clubes sem dono. cotacao (0 a 1) diz quanto do preço cheio dá para pagar: de 1 vez o salário de mercado
// (caixa vazio) a 2,5 vezes (caixa folgado); para clube no vermelho, de 1 a 3 vezes.
export const valorNoAgente = (mercado, vermelho = false, cotacao = 1) => Math.round((mercado || 0) * (1 + (vermelho ? 2 : 1.5) * Math.max(0, Math.min(1, cotacao == null ? 1 : cotacao))));
// Venda negociada: o valor fica entre 60% e 150% da multa rescisória (3 a 7,5 vezes o salário), como no 22_travas_da_negociacao.sql.
export const faixaDaNegociacao = salario => ({ minimo: 3 * (salario || 0), maximo: Math.round(7.5 * (salario || 0)) });
// 440 → "440 mil"; 1370 → "1,37 mi"
export const dinheiro = mil => mil == null ? "—" : Math.abs(mil) >= 1000 ? (mil / 1000).toFixed(2).replace(".", ",") + " mi" : mil + " mil";
