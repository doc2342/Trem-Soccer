// Base: os jovens que o clube revela. Chegam na virada da temporada (promoção) e numa peneira a partir da rodada 9.
// Quantos vêm depende do nível da base; a nota de chegada é baixa (14 a 20) e o talento médio sobe com o nível.
// Módulo puro: usado pela virada (página do administrador) e pela função "mercado" do servidor (peneira).
import { limitar } from "./rng.js";
import { gerarJogador } from "./gerador.js";
import { salarioDeMercado } from "./economia.js";

export const CONFIG_BASE = {
  promocao: [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4]], // por nível da base (0 a 5): mínimo e máximo de jovens na virada
  peneira: [[0, 0], [0, 1], [0, 1], [0, 2], [1, 2], [1, 3]],  // idem, na peneira do meio da temporada
  rodadaDaPeneira: 9,
  nota: [15, 0.6, 1.5, 13, 21], // nota de chegada: 15 + 0,6 por nível, com desvio de 1,5, entre 13 e 21
  talentoPorNivel: 4,           // cada nível da base soma 4 ao talento sorteado (1 a 100)
  idade: [16, 18], contrato: 3,
};
// posições sorteadas para os jovens: mais gente de linha do que goleiro
const POSICOES_DA_BASE = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "AMR", "AML", "FC", "SC", "RW", "LW"];
export const faixaDeJovens = (nivel, momento) => CONFIG_BASE[momento === "peneira" ? "peneira" : "promocao"][limitar(nivel || 0, 0, 5)];

// Devolve os jovens prontos para gravar: { nome, pais, idade, pos, fam, at, tal, salario, salario_mercado, contrato_ate, protegido_ate }.
// temporada: a temporada em que eles começam a jogar. usados: nomes que não podem se repetir.
export function jovensDaBase(rng, { nivel = 0, momento = "promocao", perfil = "equilibrado", nomes, usados, temporada }) {
  const C = CONFIG_BASE, [min, max] = faixaDeJovens(nivel, momento), n = rng.int(min, max), lista = [];
  for (let k = 0; k < n; k++) {
    const j = gerarJogador(rng, { id: null, pos: rng.pick(POSICOES_DA_BASE), alvo: limitar(C.nota[0] + C.nota[1] * (nivel || 0) + rng.normal(0, C.nota[2]), C.nota[3], C.nota[4]),
      idade: rng.int(C.idade[0], C.idade[1]), perfil, nomes, usados });
    const mercado = salarioDeMercado(j);
    lista.push({ nome: j.nome, pais: j.pais, idade: j.idade, pos: j.pos, fam: j.fam, at: j.at, tal: limitar(j.tal + C.talentoPorNivel * (nivel || 0), 1, 100),
      salario: mercado, salario_mercado: mercado, contrato_ate: temporada + C.contrato - 1, protegido_ate: temporada });
  }
  return lista;
}
