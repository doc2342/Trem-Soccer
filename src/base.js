// Base: os jovens que o clube revela. Chegam na virada da temporada (promoção) e numa peneira a partir da rodada 9.
// O nível da base dá quantidade e nota de chegada (15 + 1,5 por nível); o talento não depende dele. Os talentos raros vêm da safra (virada.js).
// Módulo puro: usado pela virada (página do administrador) e pela função "mercado" do servidor (peneira).
import { limitar } from "./rng.js";
import { gerarJogador } from "./gerador.js";
import { salarioDeMercado } from "./economia.js";

export const CONFIG_BASE = {
  promocao: [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4]], // por nível da base (0 a 5): mínimo e máximo de jovens na virada
  peneira: [[0, 0], [0, 1], [0, 1], [0, 2], [1, 2], [1, 3]],  // idem, na peneira do meio da temporada
  rodadaDaPeneira: 9,
  nota: [15, 1.5, 1.5, 13, 25], // nota de chegada: 15 + 1,5 por nível, com desvio de 1,5, entre 13 e 25
  idade: [16, 18], contrato: 3,
  idadeDeJuvenil: 21,           // juvenil que chega à virada com esta idade sem contrato fica livre; o formado no clube fica protegido até ela
};
export const LIMITE_DE_CONTRATADOS = 30;
export const LIMITE_DE_JUVENIS = 25;
// posições sorteadas para os jovens: mais gente de linha do que goleiro
const POSICOES_DA_BASE = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "AMR", "AML", "FC", "SC", "RW", "LW"];
export const faixaDeJovens = (nivel, momento) => CONFIG_BASE[momento === "peneira" ? "peneira" : "promocao"][limitar(nivel || 0, 0, 5)];

// Devolve os jovens prontos para gravar: { nome, pais, idade, pos, fam, at, tal, salario, salario_mercado, contrato_ate, protegido_ate }.
// temporada: a temporada em que eles começam a jogar. usados: nomes que não podem se repetir.
// juvenis (60_juvenis_e_formador.sql): chegam sem contrato nem salário e com a multa travada até os 21 anos; sem isso, contrato de 3 temporadas como antes.
export function jovensDaBase(rng, { nivel = 0, momento = "promocao", perfil = "equilibrado", nomes, usados, temporada, juvenis = false }) {
  const C = CONFIG_BASE, [min, max] = faixaDeJovens(nivel, momento), n = rng.int(min, max), lista = [];
  for (let k = 0; k < n; k++) {
    const j = gerarJogador(rng, { id: null, pos: rng.pick(POSICOES_DA_BASE), alvo: limitar(C.nota[0] + C.nota[1] * (nivel || 0) + rng.normal(0, C.nota[2]), C.nota[3], C.nota[4]),
      idade: rng.int(C.idade[0], C.idade[1]), perfil, nomes, usados });
    const mercado = salarioDeMercado(j);
    lista.push({ nome: j.nome, pais: j.pais, idade: j.idade, pos: j.pos, fam: j.fam, at: j.at, tal: j.tal,
      ...(juvenis ? { salario: null, salario_mercado: mercado, contrato_ate: null, protegido_ate: temporada + C.idadeDeJuvenil - j.idade, juvenil: true }
        : { salario: mercado, salario_mercado: mercado, contrato_ate: temporada + C.contrato - 1, protegido_ate: temporada }) });
  }
  return lista;
}
