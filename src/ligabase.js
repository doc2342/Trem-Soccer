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
  idadeMaxima: 21,      // profissional formado no clube joga a base até esta idade (só em clube com dirigente)
  premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
};
const FORMACOES_DA_BASE = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1"]; // as mesmas que o bot usa

export function garotoDaEscolinha(rng, pos, nivel, id) {
  const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
  return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
}

// Escolhe o esquema e distribui as vagas. A ordem de preferência: juvenil numa posição que conhece (natural ou competente); juvenil improvisado
// numa vaga de linha (ele não tem outro jogo para jogar); profissional formado no clube, de até 21 anos, numa posição que conhece;
// e só então garoto da escolinha. Entre os esquemas, vale o que encaixa mais juvenis, depois mais profissionais, depois a maior soma de notas.
// Devolve { nome, vagas: [{ pos, j }] (j nulo = vaga de garoto), fora: [juvenis que não cabem] }.
// ponytail: com mais de 11 juvenis, os que sobram ficam sem jogar; rodízio entre eles se algum clube chegar a esse ponto
export function escalacaoDaBase(juvenis, profissionais = []) {
  const encaixar = (vagas, lista) => { // cada jogador na vaga conhecida de maior nota; devolve [quantos entraram, soma das notas, quem sobrou]
    const livres = new Set(lista); let soma = 0, n = 0;
    for (;;) {
      let m = null;
      for (const v of vagas) if (!v.j) for (const j of livres) {
        const f = (j.fam || {})[v.pos]; if (f !== "N" && f !== "C") continue;
        const nota = notaNaPosicao(j, v.pos); if (!m || nota > m.nota) m = { v, j, nota };
      }
      if (!m) break;
      m.v.j = m.j; livres.delete(m.j); soma += m.nota; n++;
    }
    return [n, soma, [...livres]];
  };
  let melhor = null;
  for (const nome of FORMACOES_DA_BASE) {
    const vagas = FORMACOES[nome].map(pos => ({ pos, j: null })), [nJ, somaJ, fora] = encaixar(vagas, juvenis);
    for (const j of fora.slice().sort((a, b) => notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos))) { // improvisados: nunca no gol, e goleiro nunca na linha
      if (j.pos === "GK") continue;
      const v = vagas.filter(x => !x.j && x.pos !== "GK").sort((a, b) => notaNaPosicao(j, b.pos) - notaNaPosicao(j, a.pos))[0];
      if (v) { v.j = j; fora.splice(fora.indexOf(j), 1); }
    }
    const [nP, somaP] = encaixar(vagas, profissionais), pontos = nJ * 1e6 + nP * 1e4 + somaJ + somaP;
    if (!melhor || pontos > melhor.pontos) melhor = { nome, vagas, fora, pontos };
  }
  return { nome: melhor.nome, vagas: melhor.vagas, fora: melhor.fora };
}

// juvenis e profissionais: os de verdade, no formato do motor. Devolve os onze da partida, com um garoto da escolinha em cada vaga que sobrou.
export function timeDaBase(rng, juvenis, nivelDaBase = 0, prefixo = "", profissionais = []) {
  const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0);
  return escalacaoDaBase(juvenis, profissionais).vagas.map((v, i) => v.j || garotoDaEscolinha(rng, v.pos, nivel, "e" + prefixo + "_" + i));
}
