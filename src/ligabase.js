// Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
// O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
// que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
// e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
// Rodízio: quem jogou menos minutos na temporada da base tem a preferência para começar, e os juvenis que não começam entram no intervalo
// (até cinco), no lugar dos garotos da escolinha, depois dos profissionais e depois de quem mais jogou. Assim até 16 juvenis jogam 45 minutos.
import { ATRIBUTOS, notaBruta, notaNaPosicao } from "./modelo.js";
import { limitar } from "./rng.js";
import { FORMACOES } from "./escalacao.js";
import { taticaBot } from "./bot.js";

export const CONFIG_LIGA_DE_BASE = {
  escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
  nivelDoBot: 2,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 2
  bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
  minutos: 45,
  idadeMaxima: 21,      // profissional formado no clube joga a base até esta idade (só em clube com dirigente)
  premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
  trocas: 5,            // juvenis que entram no intervalo (as cinco substituições do motor)
  rodizio: 10,          // pontos de nota a menos, na escolha de quem começa, por partida inteira (90 minutos) já jogada na base
};
const FORMACOES_DA_BASE = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1"]; // as mesmas que o bot usa

export function garotoDaEscolinha(rng, pos, nivel, id) {
  const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
  return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
}

// Escolhe o esquema e distribui as vagas. A ordem de preferência: juvenil numa posição que conhece (natural ou competente); juvenil improvisado
// numa vaga de linha (ele não tem outro jogo para jogar); profissional formado no clube, de até 21 anos, numa posição que conhece;
// e só então garoto da escolinha. Entre os esquemas, vale o que encaixa mais juvenis, depois mais profissionais, depois a maior soma de notas.
// minutos: { id: minutos já jogados na base nesta temporada }, para o rodízio (o juvenil que jogou menos tem a preferência para começar).
// Devolve { nome, vagas: [{ pos, j }] (j nulo = vaga de garoto), trocas: [{ vaga (índice), entra }] no intervalo, fora: [juvenis sem jogo] }.
export function escalacaoDaBase(juvenis, profissionais = [], minutos = {}) {
  const C = CONFIG_LIGA_DE_BASE, jogou = j => minutos[j.id] || 0;
  const valor = (j, pos) => notaNaPosicao(j, pos) - (j.juvenil === false ? 0 : C.rodizio * jogou(j) / 90);
  const encaixar = (vagas, lista) => { // cada jogador na vaga conhecida de maior valor; devolve [quantos entraram, soma dos valores, quem sobrou]
    const livres = new Set(lista); let soma = 0, n = 0;
    for (;;) {
      let m = null;
      for (const v of vagas) if (!v.j) for (const j of livres) {
        const f = (j.fam || {})[v.pos]; if (f !== "N" && f !== "C") continue;
        const nota = valor(j, v.pos); if (!m || nota > m.nota) m = { v, j, nota };
      }
      if (!m) break;
      m.v.j = m.j; livres.delete(m.j); soma += m.nota; n++;
    }
    return [n, soma, [...livres]];
  };
  let melhor = null;
  for (const nome of FORMACOES_DA_BASE) {
    const vagas = FORMACOES[nome].map(pos => ({ pos, j: null })), [nJ, somaJ, fora] = encaixar(vagas, juvenis);
    for (const j of fora.slice().sort((a, b) => valor(b, b.pos) - valor(a, a.pos))) { // improvisados: nunca no gol, e goleiro nunca na linha
      if (j.pos === "GK") continue;
      const v = vagas.filter(x => !x.j && x.pos !== "GK").sort((a, b) => notaNaPosicao(j, b.pos) - notaNaPosicao(j, a.pos))[0];
      if (v) { v.j = j; fora.splice(fora.indexOf(j), 1); }
    }
    const [nP, somaP] = encaixar(vagas, profissionais), pontos = nJ * 1e6 + nP * 1e4 + somaJ + somaP;
    if (!melhor || pontos > melhor.pontos) melhor = { nome, vagas, fora, pontos };
  }
  // intervalo: os que ficaram de fora entram, primeiro quem jogou menos; cada um na vaga de um garoto, depois na de um profissional e por fim
  // na do juvenil que mais jogou, de preferência numa posição que conhece (goleiro só no gol, e ninguém de linha no gol)
  const reservas = melhor.fora.slice().sort((a, b) => jogou(a) - jogou(b) || notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos));
  const trocas = [], usadas = new Set();
  for (const j of reservas) {
    if (trocas.length >= C.trocas) break;
    const conhece = pos => ["N", "C"].includes((j.fam || {})[pos]), tipo = v => !v.j ? 0 : v.j.juvenil ? 2 : 1;
    const cand = melhor.vagas.map((v, i) => ({ v, i })).filter(({ v, i }) => !usadas.has(i) && (v.pos === "GK") === (j.pos === "GK"))
      .sort((a, b) => conhece(b.v.pos) - conhece(a.v.pos) || tipo(a.v) - tipo(b.v) || (a.v.j && b.v.j ? jogou(b.v.j) - jogou(a.v.j) : 0) || notaNaPosicao(j, b.v.pos) - notaNaPosicao(j, a.v.pos));
    if (!cand.length) continue;
    usadas.add(cand[0].i); trocas.push({ vaga: cand[0].i, entra: j });
  }
  const entram = new Set(trocas.map(x => x.entra));
  return { nome: melhor.nome, vagas: melhor.vagas, trocas, fora: reservas.filter(j => !entram.has(j)) };
}

// juvenis e profissionais: os de verdade, no formato do motor. Devolve a tática pronta da partida: { escalacao: [{ j, pos }], banco, instrucoes },
// com um garoto da escolinha em cada vaga que sobrou e as trocas do intervalo.
export function timeDaBase(rng, { juvenis = [], profissionais = [], nivel: nivelDaBase = 0, prefixo = "", minutos = {}, perfil = null } = {}) {
  const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0);
  const e = escalacaoDaBase(juvenis.map(j => ({ ...j, juvenil: true })), profissionais.map(j => ({ ...j, juvenil: false })), minutos);
  const escalacao = e.vagas.map((v, i) => ({ j: v.j || garotoDaEscolinha(rng, v.pos, nivel, "e" + prefixo + "_" + i), pos: v.pos }));
  const instrucoes = taticaBot(escalacao.map(x => x.j), { perfil }).instrucoes; // capitão, cobradores e estilo, como o bot faria com estes onze
  instrucoes.substituicoes = e.trocas.map(x => ({ min: 45, sai: escalacao[x.vaga].j.id, entra: x.entra.id, pos: escalacao[x.vaga].pos, cond: "sempre" }));
  return { escalacao, banco: e.trocas.map(x => x.entra), instrucoes };
}
