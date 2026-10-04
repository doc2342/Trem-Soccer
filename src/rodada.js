// Calendário, cálculo de uma partida da liga e classificação.
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado.
import { criarRng } from "./rng.js";
import { notaNaPosicao, LISTA_POSICOES } from "./modelo.js";
import { prepararTime, simularPartida, CONFIG } from "./motor.js";
import { taticaBot } from "./bot.js";
import { montarRelatorio } from "./relatorio.js";

export const AMARELOS_PARA_SUSPENSAO = 3; // o terceiro amarelo acumulado suspende por um jogo
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
    // titular lesionado ou suspenso é trocado pelo melhor disponível para a posição que não esteja escalado
    // quem saiu do clube (vendido, aposentado) conta como indisponível, igual a lesionado ou suspenso
    const jog = dados.jog.slice(), fora = id => !porId[id] || porId[id].fora > 0;
    const livres = elenco.filter(j => !(j.fora > 0) && !jog.includes(j.id));
    for (let i = 0; i < 11; i++) {
      if (!fora(jog[i])) continue;
      const pos = dados.vagas[i], candidatos = livres.filter(j => (j.pos === "GK") === (pos === "GK"));
      if (!candidatos.length) return null;
      const melhor = candidatos.reduce((m, j) => notaNaPosicao(j, pos) > notaNaPosicao(m, pos) ? j : m);
      livres.splice(livres.indexOf(melhor), 1); jog[i] = melhor.id;
    }
    const emCampo = new Set(jog);
    const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id) && !fora(id)))].slice(0, 7);
    const noBanco = new Set(banco), I = dados.instr || {};
    const num = (v, min, max) => Math.max(min, Math.min(max, Math.round(+v) || 0));
    const um = (v, lista, padrao) => lista.includes(v) ? v : padrao;
    const titular = id => emCampo.has(id) ? id : null;
    const lista = (l, n) => (Array.isArray(l) ? l : []).filter(id => emCampo.has(id)).slice(0, n);
    const conv = v => v === "true" ? true : v === "false" ? false : isNaN(+v) ? v : +v;
    const condicoes = ["sempre", "ganhando", "empatando", "perdendo", "cansado", "amarelo"];
    const instrucoes = {
      mentalidade: num(I.mentalidade, -2, 2), agressividade: num(I.agressividade, -2, 2), pressao: num(I.pressao, 0, 2),
      passe: um(I.passe, ["misto", "curto", "longo"], "misto"), lado: um(I.lado, ["misto", "E", "C", "D", "lados"], "misto"),
      contraAtaque: I.contraAtaque === true, impedimento: I.impedimento === true,
      capitao: titular(I.capitao), vice: titular(I.vice), armador: titular(I.armador), alvo: titular(I.alvo),
      cobradores: { escanteio: lista(I.cobradores && I.cobradores.escanteio, 3), falta: lista(I.cobradores && I.cobradores.falta, 3), penalti: lista(I.cobradores && I.cobradores.penalti, 5) },
      substituicoes: (dados.subs || []).filter(s => emCampo.has(s.sai) && noBanco.has(s.entra)).slice(0, CONFIG.maxSubstituicoes)
        .map(s => ({ min: num(s.min, 0, 89), sai: s.sai, entra: s.entra, cond: um(s.cond, condicoes, "sempre") })),
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
  const reais = (min <= 45 ? min : min + 15) * minutosTransmissao / 105;
  return new Date(new Date(inicio).getTime() + reais * 60000);
}

// O que muda em cada jogador do elenco depois da partida: quem estava fora cumpre um jogo; vermelho suspende por um jogo;
// o terceiro amarelo acumulado suspende por um jogo; lesão deixa fora por alguns jogos. Devolve só quem mudou.
// medico: { chance, vagas } do clube, ou null. Quem já estava lesionado antes do jogo pode ser atendido: os de maior nota primeiro,
// até o número de vagas; cada atendido tem a chance de voltar um jogo antes.
function situacaoDepois(elenco, p, medico = null, rng = null) {
  const atendidos = new Set(medico && rng ? elenco.filter(j => j.fora > 1 && j.motivo === "lesão").sort((a, b) => notaNaPosicao(b, b.pos) - notaNaPosicao(a, a.pos)).slice(0, medico.vagas).filter(() => rng.chance(medico.chance)).map(j => j.id) : []);
  const lesao = Object.fromEntries(p.lesoes.map(l => [l.id, l.dias])), mudancas = [];
  for (const j of elenco) {
    let fora = j.fora || 0, motivo = j.motivo || null, amarelos = j.amarelos || 0;
    if (fora > 0) { fora--; if (fora > 0 && atendidos.has(j.id)) fora--; if (!fora) motivo = null; }
    const s = p.jogadores[j.id];
    if (s) {
      if (s.vermelho) { fora = 1; motivo = "suspensão"; }
      else if (s.amarelos) { amarelos++; if (amarelos >= AMARELOS_PARA_SUSPENSAO) { amarelos = 0; fora = 1; motivo = "suspensão"; } }
      if (lesao[j.id]) { const n = jogosFora(lesao[j.id]); if (n >= fora) { fora = n; motivo = "lesão"; } }
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
export function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente }) {
  const agora = new Date(partida.inicio).getTime();
  const lados = [casa, fora].map(l => {
    const inativo = !l.clube.dono || !l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000;
    const humana = inativo ? null : taticaDoDirigente(l.tatica, l.elenco);
    const disponiveis = l.elenco.filter(j => !(j.fora > 0));
    return { ...l, disponiveis, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(disponiveis).forca };
  });
  const taticas = lados.map((l, i) => l.humana || taticaBot(l.disponiveis, { mandante: i === 0, forcaAdversario: lados[1 - i].previa, perfil: l.clube.perfil }));
  const times = lados.map((l, i) => {
    const t = taticas[i];
    return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0, prevencao: l.saude ? l.saude.prevencao : 0 });
  });
  const p = simularPartida(criarRng(semente), times[0], times[1]);
  const r = montarRelatorio(p, [3, 3]);
  const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, l.s === undefined ? l.min : l.min - 1 + l.s / 60, minutosTransmissao).toISOString(), dados: l }));
  // abertura da transmissão, liberada no apito inicial: escalações, clima e cara ou coroa (clima e moeda ainda não mexem no jogo)
  const extra = criarRng((semente >>> 0) + 7919), clima = extra.pick(CLIMAS);
  lances.unshift({ partida_id: partida.id, ordem: -1, min: 0, libera_em: new Date(partida.inicio).toISOString(), dados: {
    n: -1, min: 0, tipo: "inicio", moeda: extra.int(0, 1), clima: { nome: clima[0], temp: extra.int(clima[1], clima[2]) },
    escalacoes: taticas.map(t => ({ titulares: t.escalacao.map(e => ({ nome: e.j.nome, pos: e.pos })), banco: (t.banco || []).map(j => ({ nome: j.nome, pos: j.pos })) })),
  } });
  const { narracao, ...semNarracao } = r; // a narração já está nos lances
  return {
    lances,
    resultado: {
      partida_id: partida.id, libera_em: partida.fim, gols_casa: p.placar[0], gols_fora: p.placar[1], xg_casa: p.xg[0], xg_fora: p.xg[1],
      pts_esp_casa: r.esperado.pontos[0], pts_esp_fora: r.esperado.pontos[1],
      relatorio: { ...semNarracao, comandados: lados.map(l => l.humana ? "dirigente" : "bot") },
    },
    situacao: [...situacaoDepois(casa.elenco, p, casa.saude && casa.saude.medico, extra), ...situacaoDepois(fora.elenco, p, fora.saude && fora.saude.medico, extra)],
    minutos: Object.fromEntries(Object.entries(p.jogadores).map(([id, x]) => [id, (x.saiu === null ? 90 : x.saiu) - x.entrou])), // para o bônus de treino de quem jogou
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
