// Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
// O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
// que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
// e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
// Rodízio: quem jogou menos minutos na temporada da base tem a preferência para começar, e os juvenis que não começam são sugeridos para entrar
// no intervalo (até cinco), no lugar dos garotos da escolinha, depois dos profissionais e depois de quem mais jogou. Assim até 16 juvenis jogam 45 minutos.
// O dirigente pode montar o banco (até nove, como no time principal) e as substituições dele no lugar das sugeridas.
import { ATRIBUTOS, LISTA_POSICOES, notaBruta, notaNaPosicao } from "./modelo.js";
import { limitar } from "./rng.js";
import { FORMACOES, TAMANHO_DO_BANCO } from "./escalacao.js";
import { taticaBot, FORMACOES_BOT } from "./bot.js";

export const CONFIG_LIGA_DE_BASE = {
  escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
  nivelDoBot: 2,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 2
  nivelDeFora: 4,       // na Libertadores Juvenil, o clube de fora sem dirigente joga com garotos de uma base de nível 4 (101_libertadores_juvenil.sql)
  bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
  minutos: 45,
  idadeMaxima: 21,      // profissional joga a base até esta idade (só em clube com dirigente)
  contratados: 3,       // contratados (nem formados no clube nem do elenco inicial) que entram por partida da base
  premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
  trocas: 5,            // juvenis que entram no intervalo (as cinco substituições do motor)
  estudo: 10,           // pontos de nota a mais, na escolha da vaga, para a posição que o jogador está aprendendo (jogar nela acelera o estudo)
  rodizio: 10,          // pontos de nota a menos, na escolha de quem começa, por partida inteira (90 minutos) já jogada na base
};
const FORMACOES_DA_BASE = FORMACOES_BOT; // as mesmas que o bot usa
// Profissional contratado, para a base: chegou por contratação (chegou_temporada preenchido) e não é formado no clube.
// O elenco inicial nunca passou por contratação (chegou_temporada vazio) e joga a base como o formado.
export const contratadoNaBase = (formador, chegou, clubeId) => chegou != null && String(formador) !== String(clubeId);

export function garotoDaEscolinha(rng, pos, nivel, id) {
  const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
  return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
}

// Escolhe o esquema e distribui as vagas. A ordem de preferência: juvenil numa posição que conhece (natural ou competente); juvenil improvisado
// numa vaga de linha (ele não tem outro jogo para jogar); profissional de até 21 anos (contratado: true conta no limite de contratados), numa posição que conhece;
// e só então garoto da escolinha. Entre os esquemas, vale o que encaixa mais juvenis, depois mais profissionais, depois a maior soma de notas.
// Quem está aprendendo uma posição joga nela sempre que o esquema tiver a vaga: conta como posição conhecida e tem a preferência.
// minutos: { id: minutos já jogados na base nesta temporada }, para o rodízio (o juvenil que jogou menos tem a preferência para começar).
// Tática da base (100_tatica_da_base.sql): formacao = as 11 posições do time principal (sem ela, vale o esquema que melhor encaixa);
// fixos = { índice da vaga: id do jogador } que o dirigente pôs na vaga (só não vale goleiro na linha nem jogador de linha no gol);
// as vagas abertas são preenchidas como sempre, e o fixado não sai no intervalo.
// trocas = [{ entra: id, vaga: índice ou null }]: quem o dirigente põe para entrar no intervalo (vaga nula = a que o rodízio escolheria);
// valem antes das automáticas, e as automáticas completam as cinco. Não vale quem já começa, vaga fixada nem goleiro fora do gol.
// { entra: null, vaga }: troca tirada pelo dirigente; quem começa nessa vaga joga os 90 e o intervalo tem uma troca a menos.
// Essas trocas do intervalo são as sugeridas. banco = [ids] que o dirigente pôs no banco (até TAMANHO_DO_BANCO; não começam, a não ser fixados); o rodízio completa, primeiro com
// quem entra nas sugeridas, depois com os juvenis que jogaram menos e por fim com os profissionais. subs = [{ min, vaga, entra: id, pos, cond }]: as substituições do dirigente, como na
// tática principal, com a vaga (índice) no lugar de quem sai, porque o rodízio muda quem começa; sem subs (nem a lista vazia), valem as sugeridas.
// Só vale quem está no banco, uma vez cada, até cinco, e o contratado dentro do limite.
// Devolve { nome, vagas: [{ pos, j, fixo }] (j nulo = vaga de garoto), trocas: [{ vaga (índice), entra, manual }] no intervalo, semTroca: [vagas sem troca], fora: [juvenis sem jogo],
// banco: [jogador], sugeridas e subs: [{ min, vaga, entra: jogador, pos, cond }] (subs = as que valem), propria: o dirigente montou as subs }.
export function escalacaoDaBase(juvenis, profissionais = [], minutos = {}, { formacao = null, fixos = null, trocas: manuais = null, banco: escolhidos = null, subs: minhas = null } = {}) {
  const C = CONFIG_LIGA_DE_BASE, jogou = j => minutos[j.id] || 0;
  const estuda = (j, pos) => !!j.aprende && j.aprende.pos === pos && (j.fam || {})[pos] !== "N";
  const valor = (j, pos) => notaNaPosicao(j, pos) + (estuda(j, pos) ? C.estudo : 0) - (j.juvenil === false ? 0 : C.rodizio * jogou(j) / 90);
  const encaixar = (vagas, lista, contratados = 0) => { // cada jogador na vaga conhecida de maior valor; devolve [quantos entraram, soma dos valores, quem sobrou]
    const livres = new Set(lista); let soma = 0, n = 0;
    for (;;) {
      let m = null;
      for (const v of vagas) if (!v.j) for (const j of livres) {
        if (j.contratado && contratados >= C.contratados) continue;
        const f = (j.fam || {})[v.pos]; if (f !== "N" && f !== "C" && !estuda(j, v.pos)) continue;
        const nota = valor(j, v.pos); if (!m || nota > m.nota) m = { v, j, nota };
      }
      if (!m) break;
      m.v.j = m.j; livres.delete(m.j); soma += m.nota; n++; if (m.j.contratado) contratados++;
    }
    return [n, soma, [...livres]];
  };
  const doClube = vagasValidas(formacao);
  const esquemas = doClube ? [["do time principal", formacao]] : FORMACOES_DA_BASE.map(nome => [nome, FORMACOES[nome]]);
  const mesmoId = (j, id) => String(j.id).replace(/^j/, "") === String(id);
  const reserva = j => Array.isArray(escolhidos) && escolhidos.some(id => mesmoId(j, id)); // quem o dirigente pôs no banco não começa (só se estiver fixado numa vaga)
  let melhor = null;
  for (const [nome, posicoes] of esquemas) {
    const vagas = posicoes.map(pos => ({ pos, j: null })), fixados = new Set();
    let contratados = 0;
    for (const [i, id] of Object.entries(fixos || {})) {
      const v = vagas[i], j = [...juvenis, ...profissionais].find(x => mesmoId(x, id));
      if (j && j.contratado && contratados >= C.contratados) continue;
      if (v && !v.j && j && !fixados.has(j) && (v.pos === "GK") === (j.pos === "GK")) { v.j = j; v.fixo = true; fixados.add(j); if (j.contratado) contratados++; }
    }
    const [nJ, somaJ, fora] = encaixar(vagas, juvenis.filter(j => !fixados.has(j) && !reserva(j)));
    for (const j of fora.slice().sort((a, b) => valor(b, b.pos) - valor(a, a.pos))) { // improvisados: nunca no gol, e goleiro nunca na linha
      if (j.pos === "GK") continue;
      const v = vagas.filter(x => !x.j && x.pos !== "GK").sort((a, b) => notaNaPosicao(j, b.pos) - notaNaPosicao(j, a.pos))[0];
      if (v) { v.j = j; fora.splice(fora.indexOf(j), 1); }
    }
    fora.push(...juvenis.filter(j => !fixados.has(j) && reserva(j)));
    const [nP, somaP] = encaixar(vagas, profissionais.filter(j => !fixados.has(j) && !reserva(j)), contratados), pontos = nJ * 1e6 + nP * 1e4 + somaJ + somaP;
    if (!melhor || pontos > melhor.pontos) melhor = { nome, vagas, fora, pontos };
  }
  // intervalo: os que ficaram de fora entram, primeiro quem jogou menos; cada um na vaga de um garoto, depois na de um profissional e por fim
  // na do juvenil que mais jogou, de preferência numa posição que conhece (goleiro só no gol, e ninguém de linha no gol)
  const reservas = melhor.fora.slice().sort((a, b) => jogou(a) - jogou(b) || notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos));
  const trocas = [], usadas = new Set(), entram = new Set(), emCampo = new Set(melhor.vagas.map(v => v.j).filter(Boolean));
  let contratados = melhor.vagas.filter(v => v.j && v.j.contratado).length;
  const podeEm = (j, i) => { const v = melhor.vagas[i]; return !!v && !usadas.has(i) && !v.fixo && (v.pos === "GK") === (j.pos === "GK"); };
  const melhorVaga = j => {
    const conhece = pos => estuda(j, pos) ? 2 : +["N", "C"].includes((j.fam || {})[pos]), tipo = v => !v.j ? 0 : v.j.juvenil ? 2 : 1;
    const cand = melhor.vagas.map((v, i) => ({ v, i })).filter(({ i }) => podeEm(j, i))
      .sort((a, b) => conhece(b.v.pos) - conhece(a.v.pos) || tipo(a.v) - tipo(b.v) || (a.v.j && b.v.j ? jogou(b.v.j) - jogou(a.v.j) : 0) || notaNaPosicao(j, b.v.pos) - notaNaPosicao(j, a.v.pos));
    return cand.length ? cand[0].i : null;
  };
  const entrar = (j, i, manual) => { usadas.add(i); entram.add(j); trocas.push({ vaga: i, entra: j, manual }); if (j.contratado) contratados++; };
  const semTroca = [], cheio = () => trocas.length + semTroca.length >= C.trocas;
  for (const { entra: id, vaga } of Array.isArray(manuais) ? manuais : []) {
    if (id == null) { const v = melhor.vagas[vaga]; if (vaga != null && v && !v.fixo && !usadas.has(+vaga) && !cheio()) { usadas.add(+vaga); semTroca.push(+vaga); } continue; }
    const j = [...juvenis, ...profissionais].find(x => mesmoId(x, id));
    if (cheio() || !j || emCampo.has(j) || entram.has(j) || (j.contratado && contratados >= C.contratados)) continue;
    const i = vaga == null ? melhorVaga(j) : +vaga;
    if (i != null && podeEm(j, i)) entrar(j, i, true);
  }
  for (const j of reservas) {
    if (cheio()) break;
    if (entram.has(j) || (j.contratado && contratados >= C.contratados)) continue;
    const i = melhorVaga(j); if (i != null) entrar(j, i, false);
  }
  const todos = [...juvenis, ...profissionais], porId = id => todos.find(x => mesmoId(x, id)), banco = [];
  const sentar = j => { if (j && !emCampo.has(j) && !banco.includes(j) && banco.length < TAMANHO_DO_BANCO) banco.push(j); };
  for (const id of Array.isArray(escolhidos) ? escolhidos : []) sentar(porId(id));
  trocas.forEach(x => sentar(x.entra)); reservas.forEach(sentar);
  profissionais.slice().sort((a, b) => notaNaPosicao(b, b.pos) - notaNaPosicao(a, a.pos)).forEach(sentar); // depois dos juvenis, os profissionais que sobraram
  const sugeridas = trocas.filter(x => banco.includes(x.entra)).map(x => ({ min: 45, vaga: x.vaga, entra: x.entra, pos: melhor.vagas[x.vaga].pos, cond: "sempre" }));
  const propria = Array.isArray(minhas), subs = [];
  let nContratados = melhor.vagas.filter(v => v.j && v.j.contratado).length;
  for (const s of propria ? minhas : sugeridas) {
    const j = propria ? porId(s.entra) : s.entra, vaga = +s.vaga;
    if (subs.length >= C.trocas || !j || !banco.includes(j) || !melhor.vagas[vaga] || subs.some(x => x.entra === j) || (j.contratado && nContratados >= C.contratados)) continue;
    if (j.contratado) nContratados++;
    subs.push({ min: Math.max(0, Math.min(89, +s.min || 0)), vaga, entra: j, pos: s.pos || melhor.vagas[vaga].pos, cond: s.cond || "sempre" });
  }
  return { nome: melhor.nome, vagas: melhor.vagas, trocas, semTroca, fora: reservas.filter(j => !entram.has(j)), banco, sugeridas, subs, propria };
}

// juvenis e profissionais: os de verdade, no formato do motor. Devolve a tática pronta da partida: { escalacao: [{ j, pos }], banco, instrucoes },
// com um garoto da escolinha em cada vaga que sobrou, o banco e as substituições (as do dirigente ou as sugeridas).
// 11 posições conhecidas, um goleiro só
export const vagasValidas = f => Array.isArray(f) && f.length === 11 && f.every(p => LISTA_POSICOES.includes(p)) && f.filter(p => p === "GK").length === 1;
// Esquema da base: as vagas que o dirigente montou para ela (tatica.vagas, livres como na tática principal), um esquema pronto (tatica.esquema,
// nome de FORMACOES, das versões antigas) ou, sem nada, o do time principal.
export const esquemaDaBase = (tatica, principal) => (tatica && vagasValidas(tatica.vagas) ? tatica.vagas : tatica && FORMACOES[tatica.esquema]) || principal || null;

export function timeDaBase(rng, { juvenis = [], profissionais = [], nivel: nivelDaBase = 0, prefixo = "", minutos = {}, perfil = null, formacao = null, tatica = null } = {}) {
  const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0);
  const e = escalacaoDaBase(juvenis.map(j => ({ ...j, juvenil: true })), profissionais.map(j => ({ ...j, juvenil: false })), minutos, { formacao: esquemaDaBase(tatica, formacao), fixos: tatica && tatica.fixos, trocas: tatica && tatica.trocas, banco: tatica && tatica.banco, subs: tatica && tatica.subs });
  const escalacao = e.vagas.map((v, i) => ({ j: v.j || garotoDaEscolinha(rng, v.pos, nivel, "e" + prefixo + "_" + i), pos: v.pos }));
  const instrucoes = { ...taticaBot(escalacao.map(x => x.j), { perfil }).instrucoes, ...instrucoesDaBase(tatica && tatica.instr) }; // capitão, cobradores e estilo, como o bot faria com estes onze; o estilo escolhido pelo dirigente vale por cima
  instrucoes.substituicoes = e.subs.map(s => ({ min: s.min, sai: escalacao[s.vaga].j.id, entra: s.entra.id, pos: s.pos, cond: s.cond }));
  return { escalacao, banco: e.banco, instrucoes };
}

// Instruções que o dirigente pode escolher para a base, com as opções de cada uma (as mesmas da tática principal).
export const INSTRUCOES_DA_BASE = {
  mentalidade: [-2, -1, 0, 1, 2], agressividade: [-2, -1, 0, 1, 2], pressao: [0, 1, 2],
  passe: ["misto", "curto", "longo"], lado: ["misto", "E", "C", "D", "lados"], finalizar: ["misto", "longe", "area"], cruzamento: ["misto", "alto", "rasteiro"],
  contraAtaque: [false, true], impedimento: [false, true], cera: [false, true],
};
// Só o que é válido passa; o que faltar fica como o bot faria.
export function instrucoesDaBase(instr) {
  const r = {};
  for (const [k, opcoes] of Object.entries(INSTRUCOES_DA_BASE)) if (instr && opcoes.includes(instr[k])) r[k] = instr[k];
  return r;
}
