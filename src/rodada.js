// Calendário, cálculo de uma partida da liga e classificação.
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado.
import { criarRng } from "./rng.js";
import { notaNaPosicao, LISTA_POSICOES } from "./modelo.js";
import { prepararTime, simularPartida, CONFIG } from "./motor.js";
import { taticaBot } from "./bot.js";
import { notaDoMomento } from "./escalacao.js";
import { montarRelatorio } from "./relatorio.js";
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
    const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id) && !fora(id)))].slice(0, 7);
    // banco desfalcado (lesão, suspensão, saída ou titular que foi para o campo): completa com os melhores que sobraram,
    // garantindo um goleiro reserva se houver
    const sobra = elenco.filter(j => !(j.fora > 0) && !emCampo.has(j.id) && !banco.includes(j.id)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
    if (banco.length < 7 && !banco.some(id => porId[id].pos === "GK")) { const g = sobra.find(j => j.pos === "GK"); if (g) { banco.push(g.id); sobra.splice(sobra.indexOf(g), 1); } }
    for (const j of sobra) { if (banco.length >= 7) break; if (j.pos !== "GK") banco.push(j.id); }
    const noBanco = new Set(banco), I = dados.instr || {};
    const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || 0));
    const um = (v, lista, padrao) => lista.includes(v) ? v : padrao;
    const titular = id => emCampo.has(id) ? id : null;
    const lista = (l, n) => (Array.isArray(l) ? l : []).filter(id => emCampo.has(id)).slice(0, n);
    const conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
    const condicoes = ["sempre", "ganhando", "empatando", "perdendo", "cansado", "amarelo", "mal", "naoBem"];
    const instrucoes = {
      mentalidade: num(I.mentalidade, -2, 2), agressividade: num(I.agressividade, -2, 2), pressao: num(I.pressao, 0, 2),
      passe: um(I.passe, ["misto", "curto", "longo"], "misto"), lado: um(I.lado, ["misto", "E", "C", "D", "lados"], "misto"),
      contraAtaque: I.contraAtaque === true, impedimento: I.impedimento === true,
      capitao: titular(I.capitao), vice: titular(I.vice), armador: titular(I.armador), alvo: titular(I.alvo),
      cobradores: { escanteio: lista(I.cobradores && I.cobradores.escanteio, 3), falta: lista(I.cobradores && I.cobradores.falta, 3), penalti: lista(I.cobradores && I.cobradores.penalti, 5) },
      substituicoes: (dados.subs || []).filter(s => emCampo.has(s.sai) && noBanco.has(s.entra)).slice(0, CONFIG.maxSubstituicoes)
        .map(s => ({ min: num(s.min, 0, 89), sai: s.sai, entra: s.entra, cond: um(s.cond, condicoes, "sempre"), ...(LISTA_POSICOES.includes(s.pos) && s.pos !== "GK" ? { pos: s.pos } : {}) })), // pos: onde o substituto entra (sem ela, na posição de quem sai)
      ordens: (dados.ordens || []).slice(0, 3).map(o => {
        const [k, v] = String(o.muda || "").split(":");
        if (!["mentalidade", "pressao", "contraAtaque", "passe"].includes(k)) return null;
        return { min: num(o.min, 0, 89), cond: um(o.cond, condicoes.slice(0, 4), "sempre"), muda: { [k]: conv(v) } };
      }).filter(Boolean),
    };
    return { escalacao: dados.vagas.map((pos, i) => ({ j: porId[jog[i]], pos })), banco: banco.map(id => porId[id]), instrucoes };
  } catch (e) { return null; }
}

const forcaDoOnze = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;

// Instante em que um minuto de jogo passa a ser visível, com 15 minutos de intervalo, na escala da transmissão.
export function horaDoMinuto(inicio, min, minutosTransmissao) {
  // intervalo de 15 minutos; antes da prorrogação, mais 5 de pausa
  const reais = (min <= 45 ? min : min <= 90 ? min + 15 : min + 20) * minutosTransmissao / 105;
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

// lado: { clube: { id, nome, dono, ultimo_acesso }, elenco, tatica: dados salvos ou null, saude: saída de saudeDoClube (opcional) }
// Cada jogador do elenco pode trazer fora (jogos que ainda fica fora), motivo e amarelos.
// Devolve as linhas de lances, o resultado a gravar e a situação nova dos jogadores que mudaram.
const CLIMAS = [["Ensolarado", 24, 34], ["Céu limpo", 18, 28], ["Nublado", 16, 26], ["Chuva fraca", 14, 24], ["Chuva forte", 12, 22], ["Frio de doer", 4, 12], ["Calor forte", 32, 38]];
// Copa do Brasil: regras próprias da partida de copa.
export const COPA = { amarelosParaSuspensao: 2, faseQueZeraCartoes: 4, experiencia: 1.5, penalti: 0.76 };
// Quem não joga a copa: lesionado, suspenso na copa, ou quem já jogou a copa desta temporada por outro clube.
export const foraDaCopa = (j, clubeId) => (j.fora > 0 && j.motivo === "lesão") || j.foraCopa > 0 || (j.copaClube != null && j.copaClube !== clubeId);
// Situação dos jogadores depois de um jogo de copa: lesões valem para tudo; cartões e suspensões são só da copa
// (segundo amarelo suspende; depois das quartas os amarelos zeram, para ninguém perder a final por acúmulo).
function situacaoDaCopa(elenco, p, clubeId, fase, medico = null) {
  const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), situacao = [], copa = [];
  let vagas = medico ? medico.vagas - elenco.filter(j => j.fora > 1 && j.motivo === "lesão").length : 0;
  for (const j of elenco) {
    let fora = j.fora || 0, motivo = j.motivo || null, amarelos = j.amarelosCopa || 0, foraCopa = j.foraCopa || 0, copaClube = j.copaClube == null ? null : j.copaClube;
    if (fora > 0 && motivo === "lesão") { fora--; if (!fora) motivo = null; }
    if (foraCopa > 0) foraCopa--;
    const s = p.jogadores[j.id];
    if (s) {
      copaClube = clubeId;
      if (s.vermelho) foraCopa = 1;
      else if (s.amarelos) { amarelos++; if (amarelos >= COPA.amarelosParaSuspensao) { amarelos = 0; foraCopa = 1; } }
      if (lesao[j.id]) {
        let n = jogosFora(lesao[j.id]);
        if (medico && vagas > 0) { vagas--; n = Math.max(1, Math.round(n * (1 - medico.reducao))); }
        if (n >= fora) { fora = n; motivo = "lesão"; }
      }
    }
    if (fase === COPA.faseQueZeraCartoes) amarelos = 0;
    if (fora !== (j.fora || 0) || motivo !== (j.motivo || null)) situacao.push({ id: j.id, fora, motivo, amarelos: j.amarelos || 0 });
    if (amarelos !== (j.amarelosCopa || 0) || foraCopa !== (j.foraCopa || 0) || copaClube !== (j.copaClube == null ? null : j.copaClube)) copa.push({ id: j.id, amarelos, fora: foraCopa, clube: copaClube });
  }
  return { situacao, copa };
}

export function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente }) {
  const agora = new Date(partida.inicio).getTime(), copa = partida.fase === "copa"; // copa: campo neutro, prorrogação, pênaltis e cartões próprios
  const lados = [casa, fora].map(l => {
    const inativo = !l.clube.dono || !l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000;
    // na copa, "fora" passa a ser a indisponibilidade da copa (a suspensão da liga não vale; a da copa e a trava de clube, sim)
    const elenco = copa ? l.elenco.map(j => ({ ...j, fora: foraDaCopa(j, l.clube.id) ? 1 : 0 })) : l.elenco;
    const humana = inativo ? null : taticaDoDirigente(l.tatica, elenco);
    const disponiveis = elenco.filter(j => !(j.fora > 0));
    return { ...l, disponiveis, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(disponiveis).forca };
  });
  const taticas = lados.map((l, i) => l.humana || taticaBot(l.disponiveis, { mandante: i === 0 && !copa, forcaAdversario: lados[1 - i].previa, perfil: l.clube.perfil }));
  const times = lados.map((l, i) => {
    const t = taticas[i];
    return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 && !copa, prevencao: l.saude ? l.saude.prevencao : 0 });
  });
  const p = simularPartida(criarRng(semente), times[0], times[1], { prorrogacao: copa });
  // o comentário de cada time vem do analista dele; sem os dados da comissão (amistoso, teste), vale o nível máximo
  const r = montarRelatorio(p, [casa, fora].map(l => l.saude ? l.saude.analista || 1 : 3));
  const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, l.s === undefined ? l.min : l.min - 1 + l.s / 60, minutosTransmissao).toISOString(), dados: l }));
  // abertura da transmissão, liberada no apito inicial: escalações, clima e cara ou coroa (clima e moeda ainda não mexem no jogo)
  const extra = criarRng((semente >>> 0) + 7919), clima = extra.pick(CLIMAS);
  lances.unshift({ partida_id: partida.id, ordem: -1, min: 0, libera_em: new Date(partida.inicio).toISOString(), dados: {
    n: -1, min: 0, tipo: "inicio", moeda: extra.int(0, 1), clima: { nome: clima[0], temp: extra.int(clima[1], clima[2]) },
    escalacoes: taticas.map(t => ({ titulares: t.escalacao.map(e => ({ nome: e.j.nome, pos: e.pos })), banco: (t.banco || []).map(j => ({ nome: j.nome, pos: j.pos })) })),
  } });
  // Copa: empate nos 90 minutos vai à prorrogação, jogada pelo motor como o resto da partida; persistindo, aos pênaltis
  // (cinco para cada lado e, depois, alternados). Com prorrogação, a transmissão e o resultado terminam depois do horário de fim da partida.
  const placar = p.placar.slice(), fimReal = p.duracao > 90 ? horaDoMinuto(partida.inicio, p.duracao, minutosTransmissao).toISOString() : partida.fim;
  let penaltis = null, vencedor = null;
  if (copa) {
    const nomes = [casa.clube.nome, fora.clube.nome];
    if (placar[0] === placar[1]) {
      penaltis = [0, 0];
      // cinco cobranças alternadas, parando quando um time não alcança mais o outro; depois, uma para cada lado até desempatar
      const batidas = [0, 0];
      for (let k = 0; k < 10; k++) { const i = k % 2; batidas[i]++; if (extra.chance(COPA.penalti)) penaltis[i]++;
        if (penaltis[0] > penaltis[1] + 5 - batidas[1] || penaltis[1] > penaltis[0] + 5 - batidas[0]) break; }
      while (penaltis[0] === penaltis[1]) { const a = extra.chance(COPA.penalti), b = extra.chance(COPA.penalti); if (a) penaltis[0]++; if (b) penaltis[1]++; }
      const v = penaltis[0] > penaltis[1] ? 0 : 1;
      lances.push({ partida_id: partida.id, ordem: lances.length, min: 120, libera_em: fimReal, dados: { n: 99999, min: 120, time: v, tipo: "penaltis", texto: `A prorrogação não resolveu. Pênaltis: ${nomes[0]} ${penaltis[0]} x ${penaltis[1]} ${nomes[1]}. Passa o {${v}:${nomes[v]}}.` } });
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
    ...(() => { // na copa, cartões e suspensões vão para os campos da copa, e sai também quem passou de fase
      if (!copa) return { situacao: [...situacaoDepois(casa.elenco, p, casa.saude && casa.saude.medico), ...situacaoDepois(fora.elenco, p, fora.saude && fora.saude.medico)] };
      const a = situacaoDaCopa(casa.elenco, p, casa.clube.id, partida.copa_fase, casa.saude && casa.saude.medico), b = situacaoDaCopa(fora.elenco, p, fora.clube.id, partida.copa_fase, fora.saude && fora.saude.medico);
      return { situacao: [...a.situacao, ...b.situacao], copa: [...a.copa, ...b.copa], vencedor };
    })(),
    momento,
    minutos: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, (x.saiu === null ? p.duracao || 90 : x.saiu) - x.entrou])), // para o bônus de treino de quem jogou
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
