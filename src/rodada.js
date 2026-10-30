// Calendário, cálculo de uma partida da liga e classificação.
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado.
import { criarRng } from "./rng.js";
import { notaNaPosicao, notaBruta, LISTA_POSICOES, PAISES, PE_FRACO_DESDE } from "./modelo.js";
import { prepararTime, simularPartida, CONFIG } from "./motor.js";
import { taticaBot } from "./bot.js";
import { notaDoMomento, TAMANHO_DO_BANCO } from "./escalacao.js";
import { montarRelatorio } from "./relatorio.js";
import { papelValido, PAPEIS_DESDE, PAPEL_PADRAO } from "./papeis.js";
import { momentoDepois, experienciaDe, experienciaDepois } from "./saude.js";

export const AMARELOS_PARA_SUSPENSAO = 4; // o quarto amarelo acumulado suspende por um jogo (era o terceiro até a temporada 1; em teste na temporada 2)
// A lesão sai do motor em dias; na liga ela vira jogos fora.
export const jogosFora = dias => dias <= 3 ? 1 : dias <= 10 ? 2 : dias <= 20 ? 3 : 4;
export const DIAS_PARA_BOT = 21; // dirigente sem acessar por tantos dias: o clube joga com a tática de bot

// Turno e returno pelo método do círculo. ids: clubes do grupo. Devolve [{ rodada, casa, fora }].
// Os mandos alternam: o clube fixo troca a cada rodada e os demais pares alternam pela posição no círculo.
// O returno repete o turno na mesma ordem, com o mando invertido: a rodada 10 é a volta da rodada 1, e assim por diante.
// Dentro de cada turno ninguém passa de dois jogos seguidos em casa ou fora; na virada do turno pode haver três.
export function gerarTabela(ids) {
  const n = ids.length, roda = ids.slice(), jogos = [], meias = n - 1;
  for (let r = 0; r < meias; r++) {
    for (let k = 0; k < n / 2; k++) {
      const a = roda[k], b = roda[n - 1 - k];
      const [casa, fora] = (k === 0 ? r % 2 === 0 : k % 2 === 1) ? [a, b] : [b, a];
      jogos.push({ rodada: r + 1, casa, fora });
      jogos.push({ rodada: r + 1 + meias, casa: fora, fora: casa });
    }
    roda.splice(1, 0, roda.pop()); // gira todos menos o primeiro
  }
  return jogos.sort((x, y) => x.rodada - y.rodada);
}

// Converte a tática salva pelo dirigente no formato do motor. Devolve null se ela não for válida para o elenco atual.
export function taticaDoDirigente(dados, elenco) {
  try {
    const porId = Object.fromEntries(elenco.map(j => [j.id, j]));
    if (!dados || !Array.isArray(dados.vagas) || dados.vagas.length !== 11 || !Array.isArray(dados.jog) || dados.jog.length !== 11) return null;
    if (dados.vagas.some(p => !LISTA_POSICOES.includes(p)) || dados.vagas.filter(p => p === "GK").length !== 1) return null;
    if (new Set(dados.jog).size !== 11) return null;
    // titular lesionado ou suspenso é trocado pelo melhor disponível para a posição que não esteja escalado,
    // pela mesma nota do botão "Escalar os melhores" (com pé, forma, moral e experiência)
    // quem saiu do clube (vendido, aposentado) conta como indisponível, igual a lesionado ou suspenso
    const jog = dados.jog.slice(), fora = id => !porId[id] || porId[id].fora > 0;
    const livres = elenco.filter(j => !(j.fora > 0) && !jog.includes(j.id));
    for (let i = 0; i < 11; i++) {
      if (!fora(jog[i])) continue;
      const pos = dados.vagas[i], candidatos = livres.filter(j => (j.pos === "GK") === (pos === "GK"));
      if (!candidatos.length) return null;
      const melhor = candidatos.reduce((m, j) => notaDoMomento(j, pos) > notaDoMomento(m, pos) ? j : m);
      livres.splice(livres.indexOf(melhor), 1); jog[i] = melhor.id;
    }
    const emCampo = new Set(jog);
    const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id) && !fora(id)))].slice(0, TAMANHO_DO_BANCO);
    // banco desfalcado (lesão, suspensão, saída ou titular que foi para o campo): completa com os melhores que sobraram,
    // garantindo um goleiro reserva se houver
    const sobra = elenco.filter(j => !(j.fora > 0) && !emCampo.has(j.id) && !banco.includes(j.id)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
    if (banco.length < TAMANHO_DO_BANCO && !banco.some(id => porId[id].pos === "GK")) { const g = sobra.find(j => j.pos === "GK"); if (g) { banco.push(g.id); sobra.splice(sobra.indexOf(g), 1); } }
    for (const j of sobra) { if (banco.length >= TAMANHO_DO_BANCO) break; if (j.pos !== "GK") banco.push(j.id); }
    const noBanco = new Set(banco), I = dados.instr || {};
    const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || 0));
    const um = (v, lista, padrao) => lista.includes(v) ? v : padrao;
    const titular = id => emCampo.has(id) ? id : null;
    const lista = (l, n) => (Array.isArray(l) ? l : []).filter(id => emCampo.has(id)).slice(0, n);
    const conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
    const condicoes = ["sempre", "ganhando", "empatando", "perdendo", "umAMenos", "umAMais", "cansado", "amarelo", "mal", "naoBem"];
    const instrucoes = {
      mentalidade: num(I.mentalidade, -2, 2), agressividade: num(I.agressividade, -2, 2), pressao: num(I.pressao, 0, 2),
      passe: um(I.passe, ["misto", "curto", "longo"], "misto"), lado: um(I.lado, ["misto", "E", "C", "D", "lados"], "misto"), finalizar: um(I.finalizar, ["misto", "longe", "area"], "misto"), cruzamento: um(I.cruzamento, ["misto", "alto", "rasteiro"], "misto"),
      contraAtaque: I.contraAtaque === true, impedimento: I.impedimento === true, cera: I.cera === true,
      capitao: titular(I.capitao), vice: titular(I.vice), armador: titular(I.armador), alvo: titular(I.alvo),
      cobradores: { escanteio: lista(I.cobradores && I.cobradores.escanteio, 3), falta: lista(I.cobradores && I.cobradores.falta, 3), penalti: lista(I.cobradores && I.cobradores.penalti, 5) },
      substituicoes: (dados.subs || []).filter(s => emCampo.has(s.sai) && noBanco.has(s.entra)).slice(0, CONFIG.maxSubstituicoes)
        .map(s => ({ min: num(s.min, 0, 89), sai: s.sai, entra: s.entra, cond: um(s.cond, condicoes, "sempre"), ...(LISTA_POSICOES.includes(s.pos) && s.pos !== "GK" ? { pos: s.pos } : {}) })), // pos: onde o substituto entra (sem ela, na posição de quem sai)
      ordens: (dados.ordens || []).slice(0, 30).map(o => { // sem limite na tela; o 30 só protege a função de uma tática adulterada
        const [k, v] = String(o.muda || "").split(":");
        if (!["mentalidade", "pressao", "contraAtaque", "passe", "finalizar", "cruzamento", "cera"].includes(k)) return null;
        return { min: num(o.min, 0, 89), cond: um(o.cond, condicoes.slice(0, 6), "sempre"), muda: { [k]: conv(v) } };
      }).filter(Boolean),
    };
    const papeis = Array.isArray(dados.papeis) ? dados.papeis : []; // papel de cada vaga (src/papeis.js); o que não vale na posição cai
    return { escalacao: dados.vagas.map((pos, i) => ({ j: porId[jog[i]], pos, papel: papelValido(pos, papeis[i]) ? papeis[i] : null })), banco: banco.map(id => porId[id]), instrucoes };
  } catch (e) { return null; }
}

// Adversário do amistoso: o dirigente joga com a escalação do último jogo oficial (observada: escalacaoObservada, pública desde o apito;
// a tática salva é segredo), com banco e instruções automáticos. Bot, ou dirigente sem jogo, joga com a tática de bot (opcoes: as do taticaBot).
export function taticaDoAmistoso(elenco, observada, opcoes) {
  const t = observada && observada.vagas.length === 11 && taticaDoDirigente({ vagas: observada.vagas.map(v => v.pos), jog: observada.vagas.map(v => v.j.id) }, elenco);
  if (!t) return { ...taticaBot(elenco, opcoes), origem: "tática de bot" };
  return { ...t, forca: t.escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / 11, origem: "escalação do último jogo" };
}

const forcaDoOnze = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;

// Instante em que um minuto de jogo passa a ser visível, com 15 minutos de intervalo, na escala da transmissão.
// acr: acréscimos dos dois tempos, que empurram o que vem depois; meio: minuto inteiro do lance (diz de que tempo ele é)
export function horaDoMinuto(inicio, min, minutosTransmissao, acr = [0, 0], meio = min) {
  // intervalo de 15 minutos; antes da prorrogação, mais 5 de pausa
  const reais = (min + (meio <= 45 ? 0 : meio <= 90 ? 15 + acr[0] : 20 + acr[0] + acr[1])) * minutosTransmissao / 105;
  return new Date(new Date(inicio).getTime() + reais * 60000);
}

// O que muda em cada jogador do elenco depois da partida: quem estava fora cumpre um jogo; vermelho suspende por um jogo;
// o quarto amarelo acumulado suspende por um jogo; lesão deixa fora por alguns jogos. Devolve só quem mudou.
// medico: { reducao, vagas } do clube, ou null. A lesão nova de quem pega uma vaga livre do departamento médico dura menos:
// a skill do médico é o corte (skill 50, metade do tempo), com mínimo de 1 jogo. As vagas são dos que ainda estão lesionados.
function situacaoDepois(elenco, p, medico = null) {
  let vagas = medico ? medico.vagas - elenco.filter(j => j.fora > 1 && j.motivo === "lesão").length : 0; // quem volta no próximo jogo já liberou a vaga
  const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), mudancas = [];
  for (const j of elenco) {
    let fora = j.fora || 0, motivo = j.motivo || null, amarelos = j.amarelos || 0;
    if (fora > 0) { fora--; if (!fora) motivo = null; }
    const s = p.jogadores[j.id];
    if (s) {
      if (s.vermelho) { fora = 1; motivo = "suspensão"; }
      else if (s.amarelos) { amarelos++; if (amarelos >= AMARELOS_PARA_SUSPENSAO) { amarelos = 0; fora = 1; motivo = "suspensão"; } }
      if (lesao[j.id]) {
        let n = jogosFora(lesao[j.id]);
        if (medico && vagas > 0) { vagas--; n = Math.max(1, Math.round(n * (1 - medico.reducao))); }
        if (n >= fora) { fora = n; motivo = "lesão"; }
      }
    }
    if (fora !== (j.fora || 0) || amarelos !== (j.amarelos || 0) || motivo !== (j.motivo || null)) mudancas.push({ id: j.id, fora, motivo, amarelos });
  }
  return mudancas;
}
// Aplica as mudanças ao elenco em memória (para quando o mesmo clube tem mais de uma partida calculada em seguida).
export function aplicarSituacao(elenco, mudancas) {
  const porId = Object.fromEntries(elenco.map(j => [j.id, j]));
  for (const m of mudancas) if (porId[m.id]) Object.assign(porId[m.id], { fora: m.fora, motivo: m.motivo, amarelos: m.amarelos });
}

// lado: { clube: { id, nome, dono, ultimo_acesso }, elenco, tatica: dados salvos ou null, saude: saída de saudeDoClube (opcional) , pronta: { escalacao, banco, instrucoes } (opcional) }
// Cada jogador do elenco pode trazer fora (jogos que ainda fica fora), motivo e amarelos.
// Devolve as linhas de lances, o resultado a gravar e a situação nova dos jogadores que mudaram.
const CLIMAS = [["Ensolarado", 24, 34], ["Céu limpo", 18, 28], ["Nublado", 16, 26], ["Chuva fraca", 14, 24], ["Chuva forte", 12, 22], ["Frio de doer", 4, 12], ["Calor forte", 32, 38]];
// O clima sai do número da partida, para a previsão poder aparecer antes do jogo e ser a mesma no servidor e na tela.
// chuva: 0, 1 (fraca) ou 2 (forte) e calor (calor forte): é o que o motor lê (CONFIG.chuva e CONFIG.calor em motor.js).
// efeitoDoClima: a frase da previsão, ou "" quando o clima não mexe no jogo.
export function climaDaPartida(id) {
  const rng = criarRng((id >>> 0) * 7919 + 13), c = rng.pick(CLIMAS);
  return { nome: c[0], temp: rng.int(c[1], c[2]), chuva: c[0] === "Chuva forte" ? 2 : c[0] === "Chuva fraca" ? 1 : 0, calor: c[0] === "Calor forte" };
}
export const efeitoDoClima = c => c.chuva > 1 ? "campo pesado: o passe curto sofre bastante, o misto um pouco, a bola longa nada" : c.chuva ? "campo molhado: o passe curto sofre um pouco" : c.calor ? "todo mundo cansa 20% mais rápido" : "";
// Jogo grande: Libertadores, playoffs de acesso, final da Copa do Brasil e Supercopa. Nele a experiência pesa mais (CONFIG_EXPERIENCIA.jogoGrande).
export const jogoGrande = p => ["lib", "pre", "semi", "final"].includes(p.fase) || (p.fase === "copa" && (!p.copa_fase || p.copa_fase === 6));
// Copa do Brasil: regras próprias da partida de copa.
export const COPA = { amarelosParaSuspensao: 2, faseQueZeraCartoes: 4, experiencia: 1.5 };
// Quem não joga a copa: lesionado, suspenso na copa, ou quem já jogou a copa desta temporada por outro clube.
export const foraDaCopa = (j, clubeId) => (j.fora > 0 && j.motivo === "lesão") || j.foraCopa > 0 || (j.copaClube != null && j.copaClube !== clubeId);
// Libertadores e Sul-Americana (fase "lib"): cartões contados à parte, como na copa (vermelho e segundo amarelo suspendem por um jogo
// continental; depois das quartas os amarelos zeram). A Recopa, jogo único, não mexe neles.
export const CONTINENTAL = { amarelosParaSuspensao: 2, faseQueZeraCartoes: 4 };
export const foraDoContinental = j => (j.fora > 0 && j.motivo === "lesão") || j.foraLib > 0;
// Situação dos jogadores depois de um jogo de copa: lesões valem para tudo; cartões e suspensões são só da copa
// (segundo amarelo suspende; depois das quartas os amarelos zeram, para ninguém perder a final por acúmulo).
// continental: Libertadores ou Sul-Americana, com os campos amarelosLib e foraLib e sem trava de clube
function situacaoDaCopa(elenco, p, clubeId, fase, medico = null, continental = false) {
  const R = continental ? CONTINENTAL : COPA;
  const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), situacao = [], copa = [];
  let vagas = medico ? medico.vagas - elenco.filter(j => j.fora > 1 && j.motivo === "lesão").length : 0;
  for (const j of elenco) {
    let fora = j.fora || 0, motivo = j.motivo || null, amarelos = (continental ? j.amarelosLib : j.amarelosCopa) || 0, foraCopa = (continental ? j.foraLib : j.foraCopa) || 0, copaClube = j.copaClube == null ? null : j.copaClube;
    if (fora > 0 && motivo === "lesão") { fora--; if (!fora) motivo = null; }
    if (foraCopa > 0) foraCopa--;
    const s = p.jogadores[j.id];
    if (s) {
      if (!continental) copaClube = clubeId;
      if (s.vermelho) foraCopa = 1;
      else if (s.amarelos) { amarelos++; if (amarelos >= R.amarelosParaSuspensao) { amarelos = 0; foraCopa = 1; } }
      if (lesao[j.id]) {
        let n = jogosFora(lesao[j.id]);
        if (medico && vagas > 0) { vagas--; n = Math.max(1, Math.round(n * (1 - medico.reducao))); }
        if (n >= fora) { fora = n; motivo = "lesão"; }
      }
    }
    if (fase === R.faseQueZeraCartoes) amarelos = 0;
    if (fora !== (j.fora || 0) || motivo !== (j.motivo || null)) situacao.push({ id: j.id, fora, motivo, amarelos: j.amarelos || 0 });
    if (continental) { if (amarelos !== (j.amarelosLib || 0) || foraCopa !== (j.foraLib || 0)) copa.push({ id: j.id, amarelos, fora: foraCopa }); }
    else if (amarelos !== (j.amarelosCopa || 0) || foraCopa !== (j.foraCopa || 0) || copaClube !== (j.copaClube == null ? null : j.copaClube)) copa.push({ id: j.id, amarelos, fora: foraCopa, clube: copaClube });
  }
  return { situacao, copa: fase === 0 ? [] : copa }; // Supercopa e Recopa (fase 0): cartões e trava de clube não contam
}

// temporada: a da liga; antes de PE_FRACO_DESDE (ou sem ela) os jogadores entram sem a nota do pé fraco e o motor joga como antes
export function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente, temporada }) {
  const semPf = j => j.pf == null || temporada >= PE_FRACO_DESDE ? j : { ...j, pf: null };
  const agora = new Date(partida.inicio).getTime(), lib = partida.fase === "lib", copa = lib || partida.fase === "copa"; // copa e Libertadores: campo neutro, prorrogação e pênaltis
  const clima = climaDaPartida(partida.id == null ? semente : partida.id);
  const lados = [casa, fora].map(l => {
    l = { ...l, elenco: l.elenco.map(semPf), pronta: l.pronta && { ...l.pronta, escalacao: l.pronta.escalacao.map(e => ({ ...e, j: semPf(e.j) })), banco: (l.pronta.banco || []).map(semPf) } };
    const inativo = !l.clube.dono || (!l.clube.extra && (!l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000)); // clube extra (96) nunca fica com o bot
    // na copa, "fora" passa a ser a indisponibilidade da copa (a suspensão da liga não vale; a da copa e a trava de clube, sim);
    // na Libertadores e na Sul-Americana, a lesão e a suspensão continental (na Recopa só a lesão: foraLib é da Libertadores ou da Sul-Americana)
    const elenco = lib ? l.elenco.map(j => ({ ...j, fora: (partida.grupo === "REC" ? j.fora > 0 && j.motivo === "lesão" : foraDoContinental(j)) ? 1 : 0 })) : copa ? l.elenco.map(j => ({ ...j, fora: foraDaCopa(j, l.clube.id) ? 1 : 0 })) : l.elenco;
    const humana = l.pronta || (inativo ? null : taticaDoDirigente(l.tatica, elenco)); // pronta: tática já montada (liga de base)
    const disponiveis = elenco.filter(j => !(j.fora > 0));
    return { ...l, disponiveis, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(disponiveis).forca };
  });
  // antes de PAPEIS_DESDE (ou sem temporada) ninguém joga com papel, nem o dirigente, nem o bot
  const semPapel = t => temporada >= PAPEIS_DESDE ? t : { ...t, escalacao: t.escalacao.map(({ papel, ...e }) => e) };
  const taticas = lados.map((l, i) => semPapel(l.humana || taticaBot(l.disponiveis, { mandante: i === 0 && !copa, forcaAdversario: lados[1 - i].previa, perfil: l.clube.perfil, chuva: clima.chuva })));
  const times = lados.map((l, i) => {
    const t = taticas[i];
    return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 && !copa, prevencao: l.saude ? l.saude.prevencao : 0 });
  });
  const p = simularPartida(criarRng(semente), times[0], times[1], { prorrogacao: copa, chuva: clima.chuva, calor: clima.calor, jogoGrande: jogoGrande(partida) });
  // o comentário de cada time vem do analista dele; sem os dados da comissão (amistoso, teste), vale o nível máximo
  const r = montarRelatorio(p, [casa, fora].map(l => l.saude ? l.saude.analista || 1 : 3));
  const acr = p.acrescimos || [0, 0];
  const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, (l.s === undefined ? l.min : l.min - 1 + l.s / 60) + (l.ac || 0), minutosTransmissao, acr, l.min).toISOString(), dados: l }));
  // abertura da transmissão, liberada no apito inicial: escalações, clima e cara ou coroa (a moeda não mexe no jogo)
  const extra = criarRng((semente >>> 0) + 7919);
  lances.unshift({ partida_id: partida.id, ordem: -1, min: 0, libera_em: new Date(partida.inicio).toISOString(), dados: {
    n: -1, min: 0, tipo: "inicio", acrescimos: acr, moeda: extra.int(0, 1), clima: { nome: clima.nome, temp: clima.temp }, grande: jogoGrande(partida),
    escalacoes: taticas.map(t => ({ titulares: t.escalacao.map(e => ({ nome: e.j.nome, pos: e.pos, ...(e.j.numero ? { numero: e.j.numero } : {}), ...(e.papel ? { papel: e.papel } : {}) })), banco: (t.banco || []).map(j => ({ nome: j.nome, pos: j.pos, ...(j.numero ? { numero: j.numero } : {}) })) })),
  } });
  // Copa: empate nos 90 minutos vai à prorrogação, jogada pelo motor como o resto da partida; persistindo, aos pênaltis, que o motor também
  // bate um a um. Com prorrogação, a transmissão e o resultado terminam depois do horário de fim da partida; com pênaltis, depois da última cobrança.
  const placar = p.placar.slice(), fimDoJogo = horaDoMinuto(partida.inicio, p.duracao + (p.duracao > 90 ? 0 : acr[1]), minutosTransmissao, acr, p.duracao).getTime();
  let fimReal = new Date(fimDoJogo).toISOString(), penaltis = null, vencedor = null;
  if (copa) {
    const nomes = [casa.clube.nome, fora.clube.nome];
    if (p.penaltis) {
      penaltis = p.penaltis.placar;
      // na transmissão: o aviso no apito da prorrogação, a primeira cobrança 2 minutos depois e as outras a cada 30 segundos de verdade, seja qual for
      // a escala da transmissão (a página ao vivo usa esse tempo para o batedor se preparar, correr e o desfecho dar para ler)
      const passo = 30000, hora = k => new Date(fimDoJogo + (k < 0 ? 0 : 4 * passo + k * passo)).toISOString();
      const lance = (k, dados) => lances.push({ partida_id: partida.id, ordem: lances.length, min: 120, libera_em: hora(k), dados: { n: 99000 + k, min: 120, ...dados } });
      lance(-1, { time: 0, tipo: "penaltis", texto: "A prorrogação termina empatada. A vaga vai ser decidida nos pênaltis." });
      p.penaltis.cobrancas.forEach((c, k) => lance(k, { time: c.time, tipo: "cobranca", pen: c.resultado, quem: c.quem, ...(c.goleiro ? { goleiro: c.goleiro } : {}), placar: c.placar, texto: c.texto }));
      const v = penaltis[0] > penaltis[1] ? 0 : 1, n = p.penaltis.cobrancas.length;
      lance(n, { n: 99999, time: v, tipo: "penaltis", texto: `Fim da disputa: ${nomes[0]} ${penaltis[0]} x ${penaltis[1]} ${nomes[1]} nos pênaltis. Passa o {${v}:${nomes[v]}}.` });
      fimReal = hora(n);
    }
    vencedor = (penaltis ? penaltis[0] > penaltis[1] : placar[0] > placar[1]) ? casa.clube.id : fora.clube.id;
    r.vencedor = vencedor; if (p.duracao > 90) r.prorrogacao = true; if (penaltis) r.penaltis = penaltis;
  }
  const { narracao, ...semNarracao } = r; // a narração já está nos lances
  // forma e moral de todo mundo depois do jogo; o preparador de forma atende os de pior forma entre os que não estão fora
  const doJogo = Object.fromEntries(r.jogadores.map(j => [j.id, j])), momento = [];
  [casa, fora].forEach((l, i) => {
    const S = l.saude || {}, resultado = copa ? (vencedor === l.clube.id ? 1 : -1) : Math.sign(p.placar[i] - p.placar[1 - i]);
    const atendidos = new Set(S.forma ? l.elenco.filter(j => !(j.fora > 0)).sort((a, b) => (a.forma == null ? 50 : a.forma) - (b.forma == null ? 50 : b.forma)).slice(0, S.forma.vagas).map(j => j.id) : []);
    for (const j of l.elenco) {
      const x = doJogo[j.id], m = momentoDepois(j, { nota: x ? x.nota : null, minutos: x ? x.minutos : 0, resultado, fora: j.fora > 0 ? j.motivo : null, ganho: atendidos.has(j.id) ? S.forma.ganho : 0, psicologo: S.psicologo || 0 });
      const exp = experienciaDepois(j, x ? x.minutos : 0, copa ? COPA.experiencia : 1); // experiência: só sobe para quem entrou em campo; vale mais na copa
      if (m.forma !== (j.forma == null ? 50 : j.forma) || m.moral !== (j.moral == null ? 50 : j.moral) || exp !== j.exp) momento.push({ id: j.id, ...m, exp });
    }
  });
  return {
    lances,
    resultado: {
      partida_id: partida.id, libera_em: fimReal, gols_casa: placar[0], gols_fora: placar[1], xg_casa: p.xg[0], xg_fora: p.xg[1],
      pts_esp_casa: r.esperado.pontos[0], pts_esp_fora: r.esperado.pontos[1],
      relatorio: { ...semNarracao, comandados: lados.map(l => l.humana ? "dirigente" : "bot") },
    },
    // "Suas ordens" de cada clube com dirigente: tabela privada (90_ordens_privadas.sql), o relatório é público
    ordens: [casa, fora].map((l, i) => lados[i].humana && l.clube.dono ? { partida_id: partida.id, clube_id: l.clube.id, libera_em: fimReal, itens: p.ordens[i] } : null).filter(Boolean),
    ...(() => { // na copa, cartões e suspensões vão para os campos da copa, e sai também quem passou de fase
      if (!copa) return { situacao: [...situacaoDepois(casa.elenco, p, casa.saude && casa.saude.medico), ...situacaoDepois(fora.elenco, p, fora.saude && fora.saude.medico)] };
      // Libertadores e Sul-Americana: cartões continentais (lib); Recopa: como a Supercopa (fase 0), não mexe em cartão nenhum
      const fase = lib && partida.grupo === "REC" ? 0 : partida.copa_fase;
      const a = situacaoDaCopa(casa.elenco, p, casa.clube.id, fase, casa.saude && casa.saude.medico, lib), b = situacaoDaCopa(fora.elenco, p, fora.clube.id, fase, fora.saude && fora.saude.medico, lib);
      return { situacao: [...a.situacao, ...b.situacao], ...(lib ? { copa: [], lib: [...a.copa, ...b.copa] } : { copa: [...a.copa, ...b.copa] }), vencedor };
    })(),
    momento,
    minutos: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, (x.saiu === null ? p.duracao || 90 : x.saiu) - x.entrou])), // para o bônus de treino de quem jogou
    // papel em que cada titular jogou (o padrão quando não escolheu), só nas posições com papéis e a partir de PAPEIS_DESDE: trocar custa entrosamento (164)
    papeis: temporada >= PAPEIS_DESDE ? taticas.flatMap(t => t.escalacao.filter(e => PAPEL_PADRAO[e.pos]).map(e => ({ id: e.j.id, papel: e.papel || PAPEL_PADRAO[e.pos] }))) : [],
    posicoes: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, x.pos])), // posição em que cada um começou a jogar: acelera a posição nova
  };
}

// Tabela de um grupo a partir das partidas com resultado visível. Desempate: pontos, saldo, gols pró, gols contra.
export function classificacao(clubes, partidas, resultados) {
  const t = Object.fromEntries(clubes.map(c => [c.id, { clube: c, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, esp: 0 }]));
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  for (const p of partidas) {
    const r = res[p.id], a = t[p.casa], b = t[p.fora];
    if (!r || !a || !b || (p.fase && p.fase !== "liga")) continue;
    a.j++; b.j++; a.gp += r.gols_casa; a.gc += r.gols_fora; b.gp += r.gols_fora; b.gc += r.gols_casa; a.esp += r.pts_esp_casa; b.esp += r.pts_esp_fora;
    if (r.gols_casa > r.gols_fora) { a.v++; b.d++; a.pts += 3; } else if (r.gols_casa < r.gols_fora) { b.v++; a.d++; b.pts += 3; } else { a.e++; b.e++; a.pts++; b.pts++; }
  }
  return Object.values(t).sort((x, y) => y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp || x.gc - y.gc || x.clube.nome.localeCompare(y.clube.nome));
}

// ---------- playoff de acesso da segunda divisão (desde a T14, grupos de 8): seis classificados por grupo ----------
// Preliminar em jogo único na casa do melhor (3º x 6º e 4º x 5º; empate classifica o mandante); 1º e 2º folgam.
// Semifinal (1º x vencedor do 4x5, 2º x vencedor do 3x6) e final em ida e volta, a volta na casa da melhor campanha;
// empate no agregado classifica a melhor campanha (sem prorrogação nem pênaltis). O vencedor da final sobe.
// Rodadas, contadas depois das R rodadas de liga do grupo: preliminar R+1, semifinal R+2 e R+3, final R+4 e R+5.
// etapa = rodada − R − 1 (0 a 4): o calendário reserva uma data para cada etapa (ligas.copa.playoffs).
export const DESCENSO_DA_PRIMEIRA = 3;
export const CLASSIFICADOS_DO_PLAYOFF = 6;
const daLiga = p => !p.fase || p.fase === "liga";
// Empate classifica o mandante, que é sempre o de melhor campanha.
export const vencedorDoPlayoff = (p, r) => r.gols_casa >= r.gols_fora ? p.casa : p.fora;
// Confronto de um ou dois jogos: soma dos gols; empate classifica o mandante do último jogo (a melhor campanha). Sem resultado: null.
export function vencedorDoConfronto(jogos, res) {
  if (!jogos.length || jogos.some(p => !res[p.id])) return null;
  const ultimo = jogos.reduce((a, b) => b.rodada > a.rodada ? b : a), gols = { [ultimo.casa]: 0, [ultimo.fora]: 0 };
  for (const p of jogos) { gols[p.casa] += res[p.id].gols_casa; gols[p.fora] += res[p.id].gols_fora; }
  return gols[ultimo.fora] > gols[ultimo.casa] ? ultimo.fora : ultimo.casa;
}
// confrontos de uma fase do grupo: jogos agrupados pelo par de clubes
const confrontos = jogos => Object.values(jogos.reduce((m, p) => { const k = [p.casa, p.fora].sort((a, b) => a - b).join("x"); (m[k] = m[k] || []).push(p); return m; }, {}));
export const rodadasDeLiga = (partidas, g) => Math.max(0, ...partidas.filter(p => p.grupo === g && daLiga(p)).map(p => p.rodada));
// quem venceu o playoff do grupo (a final de ida e volta), ou null
export function vencedorDoGrupo(partidas, resultados, g) {
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  return vencedorDoConfronto(partidas.filter(p => p.grupo === g && p.fase === "final"), res);
}

// ---------- fim da temporada: tabela final e prêmios ----------
// O servidor fecha a temporada sozinho uma hora depois do último jogo (145_fechamento_da_temporada.sql) e a virada (virada.js) usa as mesmas contas.
// prêmio da liga por divisão: [campeão, lanterna], em degraus iguais entre as posições
// pela metade desde o 68_economia.sql (antes: 10 a 4 mi na A, 6 a 2,4 na B e 3,5 a 1,2 na C): entrava dinheiro demais e os caixas só cresciam
export const PREMIOS = { 1: [5000, 2000], 2: [3000, 1200] };
export const PREMIOS_DE_FORA = [9000, 5000]; // campeonato de outro país (REGUA_DE_FORA, em virada.js)
export const premioDaLiga = (divisao, posicao, clubes = 10, fora = false) => {
  const [topo, fundo] = fora ? PREMIOS_DE_FORA : PREMIOS[divisao] || PREMIOS[2];
  return Math.round(topo - (topo - fundo) * (posicao - 1) / Math.max(1, clubes - 1));
};
// Clube GUARDADO fica no grupo "X": sem partidas, fora de liga, copa, base e mercado; envelhece na virada e volta numa expansão.
export const GUARDADO = "X";
// tabela final de cada grupo, com o prêmio da liga (as linhas do histórico, sem o destino)
export function classificacaoFinal(clubes, partidas, resultados) {
  const linhas = [];
  for (const g of [...new Set(clubes.map(c => c.grupo))].filter(g => g !== GUARDADO).sort()) { // guardado não tem tabela nem histórico
    const doGrupo = clubes.filter(c => c.grupo === g);
    classificacao(doGrupo, partidas.filter(p => p.grupo === g), resultados).forEach((t, i) => linhas.push({ clube_id: t.clube.id, divisao: t.clube.divisao, grupo: g, posicao: i + 1,
      pontos: t.pts, vitorias: t.v, empates: t.e, derrotas: t.d, gols_pro: t.gp, gols_contra: t.gc, premio: premioDaLiga(t.clube.divisao, i + 1, doGrupo.length, !!PAISES[g]) }));
  }
  return linhas;
}
// fundo da liga: bônus de mérito da Série C (campeão do grupo, 2º, 3º e 4º, e quem sobe pelo playoff sem ter sido o campeão)
export const BONUS_DA_C = [0, 800, 400, 300, 200];
export const BONUS_DO_ACESSO_NA_C = 600;
export function meritoDaSerieC(linhas, subiram = []) {
  const merito = linhas.filter(x => x.divisao === 3 && x.posicao <= 4).map(x => ({ clube_id: x.clube_id, valor: BONUS_DA_C[x.posicao], descricao: `Fundo da liga: bônus pelo ${x.posicao}º lugar na Série C` }));
  for (const id of subiram) { const x = linhas.find(c => c.clube_id === id); if (x && x.divisao === 3 && x.posicao !== 1) merito.push({ clube_id: id, valor: BONUS_DO_ACESSO_NA_C, descricao: "Fundo da liga: bônus pelo acesso no playoff" }); }
  return merito;
}
// técnico do ano de cada série: quem mais superou a colocação esperada pela força do elenco (média dos 11 melhores), só de honra
export const mediaDosOnze = (elenco = []) => { const n = elenco.map(j => notaBruta(j.at, j.pos)).sort((a, b) => b - a).slice(0, 11); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; };
// quanto cada clube superou, na sua série, a colocação esperada pela força do elenco: { clube_id: posições }
export function superacaoNaSerie(linhas, elencos) {
  const s = {};
  for (const g of new Set(linhas.map(x => x.grupo))) {
    const l = linhas.filter(x => x.grupo === g), forca = Object.fromEntries(l.map(x => [x.clube_id, mediaDosOnze(elencos[x.clube_id])]));
    [...l].sort((a, b) => forca[b.clube_id] - forca[a.clube_id]).forEach((x, i) => { s[x.clube_id] = i + 1 - x.posicao; });
  }
  return s;
}
export function tecnicosDoAno(linhas, elencos) {
  const s = superacaoNaSerie(linhas, elencos);
  return [...new Set(linhas.map(x => x.grupo))].map(g => {
    const t = linhas.filter(x => x.grupo === g).sort((a, b) => s[b.clube_id] - s[a.clube_id] || a.posicao - b.posicao)[0];
    return { grupo: g, clube_id: t.clube_id, numero: s[t.clube_id] };
  });
}
// Técnico do ano geral, só entre dirigentes: pontos da temporada inteira (spec 2026-10-26-tecnico-geral). Mata-mata: campeão, vice, semi, quartas.
export const PESOS_DO_TECNICO_GERAL = { A: [10, 8, 7, 6, 5, 4, 3, 3, 2, 1, 0, 0], B: [4, 3, 2, 1, 1, 1], playoff: { campeao: 6, vice: 4, semi: 3 }, LIB: [11, 7, 4, 2], COPA: [6, 4, 2, 1], SUL: [5, 3, 2, 1], SUPER: 1, REC: 1 };
// partidas: liga, playoff ("semi", "final"), copa e "lib" (com copa_fase e vencedor); donos: Set dos ids com dirigente
export function pontosDoTecnicoGeral({ linhas, partidas, resultados, donos }) {
  const P = PESOS_DO_TECNICO_GERAL, pts = {}, dar = (id, v) => { if (donos.has(id) && v) pts[id] = (pts[id] || 0) + v; };
  // liga; na Série B vale o maior entre a posição e o playoff (sem final no grupo, o 1º é o campeão)
  for (const x of linhas) {
    if (!donos.has(x.clube_id)) continue;
    pts[x.clube_id] = pts[x.clube_id] || 0;
    if (x.divisao === 1 && !PAISES[x.grupo]) dar(x.clube_id, P.A[x.posicao - 1] || 0);
    else if (x.divisao === 2 && !PAISES[x.grupo]) {
      const final = partidas.filter(p => p.grupo === x.grupo && p.fase === "final"), naFinal = final.some(p => p.casa === x.clube_id || p.fora === x.clube_id);
      const campeao = final.length ? vencedorDoGrupo(partidas, resultados, x.grupo) === x.clube_id : x.posicao === 1;
      const semi = partidas.some(p => p.grupo === x.grupo && p.fase === "semi" && (p.casa === x.clube_id || p.fora === x.clube_id));
      dar(x.clube_id, Math.max(P.B[x.posicao - 1] || 0, campeao ? P.playoff.campeao : naFinal ? P.playoff.vice : semi ? P.playoff.semi : 0));
    }
  }
  // mata-mata: a fase mais adiantada de cada clube (6 = final; final sem vencedor ainda: os dois como vice)
  const mataMata = (jogos, regua) => {
    const chegou = {};
    for (const p of jogos) for (const id of [p.casa, p.fora]) chegou[id] = Math.max(chegou[id] || 0, p.copa_fase);
    const final = jogos.find(p => p.copa_fase === 6 && p.vencedor);
    for (const [id, f] of Object.entries(chegou)) dar(+id, final && final.vencedor === +id ? regua[0] : regua[6 - f + 1] || 0);
  };
  mataMata(partidas.filter(p => p.fase === "copa" && p.copa_fase > 0), P.COPA);
  for (const g of ["LIB", "SUL"]) mataMata(partidas.filter(p => p.fase === "lib" && p.grupo === g), P[g]);
  for (const p of partidas) {
    if (p.fase === "copa" && p.copa_fase === 0 && p.vencedor) dar(p.vencedor, P.SUPER);
    if (p.fase === "lib" && p.grupo === "REC" && p.vencedor) dar(p.vencedor, P.REC);
  }
  return pts;
}
// o vencedor ({ grupo: "TODOS", clube_id, numero: pontos }) ou null; empate: maior superação na série, depois a melhor posição
export function tecnicoGeral({ linhas, partidas, resultados, elencos, donos }) {
  const pts = pontosDoTecnicoGeral({ linhas, partidas, resultados, donos }), s = superacaoNaSerie(linhas, elencos);
  const pos = Object.fromEntries(linhas.map(x => [x.clube_id, x.posicao]));
  const t = Object.keys(pts).map(Number).filter(id => pts[id] > 0).sort((a, b) => pts[b] - pts[a] || (s[b] || 0) - (s[a] || 0) || (pos[a] || 99) - (pos[b] || 99))[0];
  return t ? { grupo: "TODOS", clube_id: t, numero: pts[t] } : null;
}
// Devolve os jogos a criar agora, de todos os grupos da segunda divisão em diante, cada um na fase em que está:
// { jogos: [{ grupo, rodada, fase, etapa, casa, fora }] } ou { erro }. O grupo avança quando a liga DELE termina.
export function proximaFaseDosPlayoffs({ clubes, partidas, resultados }) {
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  const grupos = [...new Set(clubes.filter(c => c.divisao > 1).map(c => c.grupo))].filter(g => partidas.some(p => p.grupo === g && daLiga(p))).sort();
  if (!grupos.length) return { erro: "Nenhum grupo disputa playoff (só as divisões abaixo da primeira)." };
  const jogos = [], esperando = [];
  for (const g of grupos) {
    const doGrupo = partidas.filter(p => p.grupo === g), R = rodadasDeLiga(partidas, g);
    if (doGrupo.some(p => daLiga(p) && !res[p.id])) { esperando.push(g); continue; }
    const t = classificacao(clubes.filter(c => c.grupo === g), doGrupo, resultados).map(x => x.clube.id);
    if (t.length < CLASSIFICADOS_DO_PLAYOFF) continue;
    const melhor = (a, b) => t.indexOf(a) <= t.indexOf(b) ? [a, b] : [b, a];
    // ida e volta: ida na casa da pior campanha, volta na da melhor
    const idaEVolta = (fase, rodada, a, b) => { const [m, p] = melhor(a, b);
      jogos.push({ grupo: g, rodada, fase, etapa: rodada - R - 1, casa: p, fora: m }, { grupo: g, rodada: rodada + 1, fase, etapa: rodada - R, casa: m, fora: p }); };
    const pre = doGrupo.filter(p => p.fase === "pre"), semis = doGrupo.filter(p => p.fase === "semi"), finais = doGrupo.filter(p => p.fase === "final");
    if (!pre.length) {
      jogos.push({ grupo: g, rodada: R + 1, fase: "pre", etapa: 0, casa: t[2], fora: t[5] }, { grupo: g, rodada: R + 1, fase: "pre", etapa: 0, casa: t[3], fora: t[4] });
      continue;
    }
    if (!semis.length) {
      const v = pre.map(p => res[p.id] ? vencedorDoPlayoff(p, res[p.id]) : null);
      if (v.includes(null)) { esperando.push(g); continue; }
      const de = casa => v[pre.findIndex(p => p.casa === casa)]; // vencedor do jogo em que o casa foi mandante
      idaEVolta("semi", R + 2, t[0], de(t[3])); idaEVolta("semi", R + 2, t[1], de(t[2]));
      continue;
    }
    if (finais.length) continue; // playoff do grupo completo
    const v = confrontos(semis).map(c => vencedorDoConfronto(c, res));
    if (v.includes(null) || v.length !== 2) { esperando.push(g); continue; }
    idaEVolta("final", R + 4, v[0], v[1]);
  }
  if (!jogos.length) return { erro: esperando.length ? `Ainda em jogo: ${esperando.join(", ")}.` : "Os playoffs já foram todos criados." };
  return { jogos };
}
