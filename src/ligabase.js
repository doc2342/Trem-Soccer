// Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
// O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
// que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
// e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
// Rodízio: quem jogou menos minutos na temporada da base tem a preferência para começar, e os juvenis que não começam entram no intervalo
// (até cinco), no lugar dos garotos da escolinha, depois dos profissionais e depois de quem mais jogou. Assim até 16 juvenis jogam 45 minutos.
import { ATRIBUTOS, LISTA_POSICOES, notaBruta, notaNaPosicao } from "./modelo.js";
import { limitar } from "./rng.js";
import { FORMACOES } from "./escalacao.js";
import { taticaBot, FORMACOES_BOT } from "./bot.js";

export const CONFIG_LIGA_DE_BASE = {
  escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
  nivelDoBot: 2,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 2
  nivelDeFora: 4,       // na Libertadores Juvenil, o clube de fora sem dirigente joga com garotos de uma base de nível 4 (101_libertadores_juvenil.sql)
  bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
  minutos: 45,
  idadeMaxima: 21,      // profissional formado no clube joga a base até esta idade (só em clube com dirigente)
  premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
  trocas: 5,            // juvenis que entram no intervalo (as cinco substituições do motor)
  estudo: 10,           // pontos de nota a mais, na escolha da vaga, para a posição que o jogador está aprendendo (jogar nela acelera o estudo)
  rodizio: 10,          // pontos de nota a menos, na escolha de quem começa, por partida inteira (90 minutos) já jogada na base
};
const FORMACOES_DA_BASE = FORMACOES_BOT; // as mesmas que o bot usa

export function garotoDaEscolinha(rng, pos, nivel, id) {
  const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
  return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
}

// Escolhe o esquema e distribui as vagas. A ordem de preferência: juvenil numa posição que conhece (natural ou competente); juvenil improvisado
// numa vaga de linha (ele não tem outro jogo para jogar); profissional formado no clube, de até 21 anos, numa posição que conhece;
// e só então garoto da escolinha. Entre os esquemas, vale o que encaixa mais juvenis, depois mais profissionais, depois a maior soma de notas.
// Quem está aprendendo uma posição joga nela sempre que o esquema tiver a vaga: conta como posição conhecida e tem a preferência.
// minutos: { id: minutos já jogados na base nesta temporada }, para o rodízio (o juvenil que jogou menos tem a preferência para começar).
// Tática da base (100_tatica_da_base.sql): formacao = as 11 posições do time principal (sem ela, vale o esquema que melhor encaixa);
// fixos = { índice da vaga: id do jogador } que o dirigente pôs na vaga (só não vale goleiro na linha nem jogador de linha no gol);
// as vagas abertas são preenchidas como sempre, e o fixado não sai no intervalo.
// Devolve { nome, vagas: [{ pos, j, fixo }] (j nulo = vaga de garoto), trocas: [{ vaga (índice), entra }] no intervalo, fora: [juvenis sem jogo] }.
export function escalacaoDaBase(juvenis, profissionais = [], minutos = {}, { formacao = null, fixos = null } = {}) {
  const C = CONFIG_LIGA_DE_BASE, jogou = j => minutos[j.id] || 0;
  const estuda = (j, pos) => !!j.aprende && j.aprende.pos === pos && (j.fam || {})[pos] !== "N";
  const valor = (j, pos) => notaNaPosicao(j, pos) + (estuda(j, pos) ? C.estudo : 0) - (j.juvenil === false ? 0 : C.rodizio * jogou(j) / 90);
  const encaixar = (vagas, lista) => { // cada jogador na vaga conhecida de maior valor; devolve [quantos entraram, soma dos valores, quem sobrou]
    const livres = new Set(lista); let soma = 0, n = 0;
    for (;;) {
      let m = null;
      for (const v of vagas) if (!v.j) for (const j of livres) {
        const f = (j.fam || {})[v.pos]; if (f !== "N" && f !== "C" && !estuda(j, v.pos)) continue;
        const nota = valor(j, v.pos); if (!m || nota > m.nota) m = { v, j, nota };
      }
      if (!m) break;
      m.v.j = m.j; livres.delete(m.j); soma += m.nota; n++;
    }
    return [n, soma, [...livres]];
  };
  const doClube = Array.isArray(formacao) && formacao.length === 11 && formacao.every(p => LISTA_POSICOES.includes(p)) && formacao.filter(p => p === "GK").length === 1;
  const esquemas = doClube ? [["do time principal", formacao]] : FORMACOES_DA_BASE.map(nome => [nome, FORMACOES[nome]]);
  const mesmoId = (j, id) => String(j.id).replace(/^j/, "") === String(id);
  let melhor = null;
  for (const [nome, posicoes] of esquemas) {
    const vagas = posicoes.map(pos => ({ pos, j: null })), fixados = new Set();
    for (const [i, id] of Object.entries(fixos || {})) {
      const v = vagas[i], j = [...juvenis, ...profissionais].find(x => mesmoId(x, id));
      if (v && !v.j && j && !fixados.has(j) && (v.pos === "GK") === (j.pos === "GK")) { v.j = j; v.fixo = true; fixados.add(j); }
    }
    const [nJ, somaJ, fora] = encaixar(vagas, juvenis.filter(j => !fixados.has(j)));
    for (const j of fora.slice().sort((a, b) => valor(b, b.pos) - valor(a, a.pos))) { // improvisados: nunca no gol, e goleiro nunca na linha
      if (j.pos === "GK") continue;
      const v = vagas.filter(x => !x.j && x.pos !== "GK").sort((a, b) => notaNaPosicao(j, b.pos) - notaNaPosicao(j, a.pos))[0];
      if (v) { v.j = j; fora.splice(fora.indexOf(j), 1); }
    }
    const [nP, somaP] = encaixar(vagas, profissionais.filter(j => !fixados.has(j))), pontos = nJ * 1e6 + nP * 1e4 + somaJ + somaP;
    if (!melhor || pontos > melhor.pontos) melhor = { nome, vagas, fora, pontos };
  }
  // intervalo: os que ficaram de fora entram, primeiro quem jogou menos; cada um na vaga de um garoto, depois na de um profissional e por fim
  // na do juvenil que mais jogou, de preferência numa posição que conhece (goleiro só no gol, e ninguém de linha no gol)
  const reservas = melhor.fora.slice().sort((a, b) => jogou(a) - jogou(b) || notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos));
  const trocas = [], usadas = new Set();
  for (const j of reservas) {
    if (trocas.length >= C.trocas) break;
    const conhece = pos => estuda(j, pos) ? 2 : +["N", "C"].includes((j.fam || {})[pos]), tipo = v => !v.j ? 0 : v.j.juvenil ? 2 : 1;
    const cand = melhor.vagas.map((v, i) => ({ v, i })).filter(({ v, i }) => !usadas.has(i) && !v.fixo && (v.pos === "GK") === (j.pos === "GK"))
      .sort((a, b) => conhece(b.v.pos) - conhece(a.v.pos) || tipo(a.v) - tipo(b.v) || (a.v.j && b.v.j ? jogou(b.v.j) - jogou(a.v.j) : 0) || notaNaPosicao(j, b.v.pos) - notaNaPosicao(j, a.v.pos));
    if (!cand.length) continue;
    usadas.add(cand[0].i); trocas.push({ vaga: cand[0].i, entra: j });
  }
  const entram = new Set(trocas.map(x => x.entra));
  return { nome: melhor.nome, vagas: melhor.vagas, trocas, fora: reservas.filter(j => !entram.has(j)) };
}

// juvenis e profissionais: os de verdade, no formato do motor. Devolve a tática pronta da partida: { escalacao: [{ j, pos }], banco, instrucoes },
// com um garoto da escolinha em cada vaga que sobrou e as trocas do intervalo.
export function timeDaBase(rng, { juvenis = [], profissionais = [], nivel: nivelDaBase = 0, prefixo = "", minutos = {}, perfil = null, formacao = null, tatica = null } = {}) {
  const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0);
  const e = escalacaoDaBase(juvenis.map(j => ({ ...j, juvenil: true })), profissionais.map(j => ({ ...j, juvenil: false })), minutos, { formacao, fixos: tatica && tatica.fixos });
  const escalacao = e.vagas.map((v, i) => ({ j: v.j || garotoDaEscolinha(rng, v.pos, nivel, "e" + prefixo + "_" + i), pos: v.pos }));
  const instrucoes = { ...taticaBot(escalacao.map(x => x.j), { perfil }).instrucoes, ...instrucoesDaBase(tatica && tatica.instr) }; // capitão, cobradores e estilo, como o bot faria com estes onze; o estilo escolhido pelo dirigente vale por cima
  instrucoes.substituicoes = e.trocas.map(x => ({ min: 45, sai: escalacao[x.vaga].j.id, entra: x.entra.id, pos: escalacao[x.vaga].pos, cond: "sempre" }));
  return { escalacao, banco: e.trocas.map(x => x.entra), instrucoes };
}

// Instruções que o dirigente pode escolher para a base, com as opções de cada uma (as mesmas da tática principal).
export const INSTRUCOES_DA_BASE = {
  mentalidade: [-2, -1, 0, 1, 2], agressividade: [-2, -1, 0, 1, 2], pressao: [0, 1, 2],
  passe: ["misto", "curto", "longo"], lado: ["misto", "E", "C", "D", "lados"], finalizar: ["misto", "longe", "area"],
  contraAtaque: [false, true], impedimento: [false, true],
};
// Só o que é válido passa; o que faltar fica como o bot faria.
export function instrucoesDaBase(instr) {
  const r = {};
  for (const [k, opcoes] of Object.entries(INSTRUCOES_DA_BASE)) if (instr && opcoes.includes(instr[k])) r[k] = instr[k];
  return r;
}
