// Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
// O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
// que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
// e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
import { ATRIBUTOS, notaBruta, notaNaPosicao } from "./modelo.js";
import { limitar } from "./rng.js";
import { FORMACOES } from "./escalacao.js";

export const CONFIG_LIGA_DE_BASE = {
  escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
  nivelDoBot: 2,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 2
  bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
  minutos: 45,
  premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
};
const FORMACOES_DA_BASE = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1"]; // as mesmas que o bot usa

export function garotoDaEscolinha(rng, pos, nivel, id) {
  const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
  return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
}

// Escolhe o esquema em que mais juvenis jogam numa posição que conhecem (natural ou competente) e os distribui nas vagas.
// Quem sobra sem vaga conhecida entra improvisado numa vaga de linha, se houver; só então ficam vagas para os garotos da escolinha.
// Devolve { nome, vagas: [{ pos, j }] (j nulo = vaga de garoto), fora: [juvenis que não cabem] }.
// ponytail: com mais de 11 juvenis, os que sobram ficam sem jogar; rodízio entre eles se algum clube chegar a esse ponto
export function escalacaoDaBase(juvenis) {
  let melhor = null;
  for (const nome of FORMACOES_DA_BASE) {
    const vagas = FORMACOES[nome].map(pos => ({ pos, j: null })), livres = new Set(juvenis); let soma = 0, n = 0;
    for (;;) {
      let m = null;
      for (const v of vagas) if (!v.j) for (const j of livres) {
        const f = (j.fam || {})[v.pos]; if (f !== "N" && f !== "C") continue;
        const nota = notaNaPosicao(j, v.pos); if (!m || nota > m.nota) m = { v, j, nota };
      }
      if (!m) break;
      m.v.j = m.j; livres.delete(m.j); soma += m.nota; n++;
    }
    if (!melhor || n > melhor.n || (n === melhor.n && soma > melhor.soma)) melhor = { nome, vagas, n, soma, fora: [...livres] };
  }
  for (const j of melhor.fora.slice().sort((a, b) => notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos))) { // improvisados: nunca no gol, e goleiro nunca na linha
    if (j.pos === "GK") continue;
    const v = melhor.vagas.filter(x => !x.j && x.pos !== "GK").sort((a, b) => notaNaPosicao(j, b.pos) - notaNaPosicao(j, a.pos))[0];
    if (v) { v.j = j; melhor.fora.splice(melhor.fora.indexOf(j), 1); }
  }
  return { nome: melhor.nome, vagas: melhor.vagas, fora: melhor.fora };
}

// juvenis: os de verdade, no formato do motor. Devolve os onze da partida: os juvenis escalados e um garoto da escolinha em cada vaga que sobrou.
export function timeDaBase(rng, juvenis, nivelDaBase = 0, prefixo = "") {
  const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0);
  return escalacaoDaBase(juvenis).vagas.map((v, i) => v.j || garotoDaEscolinha(rng, v.pos, nivel, "e" + prefixo + "_" + i));
}
