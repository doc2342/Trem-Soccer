// Base: os jovens que o clube revela. Chegam na virada da temporada (promoção) e numa peneira a partir da rodada 9.
// O nível da base dá quantidade e nota de chegada (15 + 1,5 por nível); o talento não depende dele. Os talentos raros vêm da safra (virada.js).
// Módulo puro: usado pela virada (página do administrador) e pela função "mercado" do servidor (peneira).
import { limitar } from "./rng.js";
import { gerarJogador, TALENTO_COMUM } from "./gerador.js";
import { talentoMinimo } from "./modelo.js";
import { salarioDeMercado } from "./economia.js";

export const CONFIG_BASE = {
  promocao: [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4]], // por nível da base (0 a 5): mínimo e máximo de jovens na virada
  peneira: [[0, 0], [0, 1], [0, 1], [0, 2], [1, 2], [1, 3]],  // idem, na peneira do meio da temporada
  rodadaDaPeneira: 9,
  nota: [15, 1.5, 1.5, 13, 25], // nota de chegada: 15 + 1,5 por nível, com desvio de 1,5, entre 13 e 25
  idade: [16, 18], contrato: 3,
  idadeDeJuvenil: 21,           // juvenil que chega à virada com esta idade sem contrato fica livre; o formado no clube fica protegido até ela
};
// Reinício (relatório da calibragem): os jovens da base dos dirigentes nascem com 12 de talento a menos (média 46 em vez de 58), sem descer
// do mínimo que a nota de chegada pede; o raro da safra (acima de TALENTO_COMUM) não muda.
export const TALENTO_DA_BASE = -12;
export const LIMITE_DE_CONTRATADOS = 30;
export const LIMITE_DE_JUVENIS = 25;
// posições sorteadas para os jovens: mais gente de linha do que goleiro
const POSICOES_DA_BASE = ["GK", "DC", "DC", "DR", "DL", "DMC", "MC", "MC", "MR", "ML", "AMC", "AMR", "AML", "FC", "SC", "RW", "LW"];
export const faixaDeJovens = (nivel, momento) => CONFIG_BASE[momento === "peneira" ? "peneira" : "promocao"][limitar(nivel || 0, 0, 5)];

// Devolve os jovens prontos para gravar: { nome, pais, idade, pos, fam, at, tal, salario, salario_mercado, contrato_ate, protegido_ate }.
// temporada: a temporada em que eles começam a jogar. usados: nomes que não podem se repetir.
// jaTem: posições dos jovens que o clube já tem; cada um na posição divide por mais um a chance de vir outro igual (os desta leva também contam).
// usa: as 11 posições da tática salva do clube; cada vaga soma um ao peso da posição (e traz líbero e alas, que fora disso a base não revela).
// extra: jovens a mais além do sorteio (prêmio da diretoria de 95+ na peneira, 153_premios_da_diretoria.sql).
// juvenis (60_juvenis_e_formador.sql): chegam sem contrato nem salário e com a multa travada até os 21 anos; sem isso, contrato de 3 temporadas como antes.
export function jovensDaBase(rng, { nivel = 0, momento = "promocao", perfil = "equilibrado", nomes, usados, temporada, juvenis = false, jaTem = [], usa = [], extra = 0 }) {
  const C = CONFIG_BASE, [min, max] = faixaDeJovens(nivel, momento), n = rng.int(min, max) + extra, lista = [], tem = {};
  for (const p of jaTem) tem[p] = (tem[p] || 0) + 1;
  const sortearPosicao = () => {
    const opcoes = [...POSICOES_DA_BASE, ...new Set(usa.filter(p => !POSICOES_DA_BASE.includes(p)))];
    const pesos = opcoes.map(p => (1 + usa.filter(u => u === p).length) / (1 + (tem[p] || 0))); let r = rng.n() * pesos.reduce((a, b) => a + b, 0);
    const pos = opcoes[Math.max(0, pesos.findIndex(w => (r -= w) < 0))];
    tem[pos] = (tem[pos] || 0) + 1; return pos;
  };
  for (let k = 0; k < n; k++) {
    const j = gerarJogador(rng, { id: null, pos: sortearPosicao(), alvo: limitar(C.nota[0] + C.nota[1] * (nivel || 0) + rng.normal(0, C.nota[2]), C.nota[3], C.nota[4]),
      idade: rng.int(C.idade[0], C.idade[1]), perfil, nomes, usados });
    if (j.tal <= TALENTO_COMUM) j.tal = Math.max(talentoMinimo(j), limitar(j.tal + TALENTO_DA_BASE, 1, TALENTO_COMUM));
    const mercado = salarioDeMercado(j);
    lista.push({ nome: j.nome, nome_completo: j.nome_completo, pais: j.pais, idade: j.idade, pos: j.pos, fam: j.fam, at: j.at, tal: j.tal,
      ...(juvenis ? { salario: null, salario_mercado: mercado, contrato_ate: null, protegido_ate: temporada + C.idadeDeJuvenil - j.idade, juvenil: true }
        : { salario: mercado, salario_mercado: mercado, contrato_ate: temporada + C.contrato - 1, protegido_ate: temporada }) });
  }
  return lista;
}

// Reinício (155_garotos_da_escolinha.sql): cada clube com dirigente começa com um onze de 16 anos da escolinha, de teto ~25 (talento 10),
// que não assina contrato e sai da liga aos 21, e com 2 juvenis comuns de talento de Série A (60 a 75: teto 35 a 38), para o time da base
// não ser só de garotos anônimos enquanto a base de nível 0 revela um por temporada. Chegam com a nota da base de nível 0.
export const JUVENIS_DO_REINICIO = { escolinha: ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "AMR", "AML", "FC"], talentoDaEscolinha: 10, talentosos: 2, talento: [60, 75] };
export function juvenisDoReinicio(rng, { nomes, usados, escolinha = true, talentosos = JUVENIS_DO_REINICIO.talentosos }) {
  const R = JUVENIS_DO_REINICIO, C = CONFIG_BASE;
  const jovem = (pos, tal, daEscolinha) => {
    const j = gerarJogador(rng, { id: null, pos, alvo: limitar(C.nota[0] + rng.normal(0, C.nota[2]), C.nota[3], C.nota[4]), idade: 16, nomes, usados });
    return { nome: j.nome, nome_completo: j.nome_completo, pais: j.pais, idade: 16, pos, fam: j.fam, at: j.at, tal: Math.max(talentoMinimo(j), tal),
      salario: null, salario_mercado: salarioDeMercado(j), contrato_ate: null, protegido_ate: C.idadeDeJuvenil - 16, juvenil: true, escolinha: daEscolinha };
  };
  return [...(escolinha ? R.escolinha : []).map(pos => jovem(pos, R.talentoDaEscolinha, true)),
    ...Array.from({ length: talentosos }, () => jovem(rng.pick(POSICOES_DA_BASE), rng.int(R.talento[0], R.talento[1]), false))];
}
