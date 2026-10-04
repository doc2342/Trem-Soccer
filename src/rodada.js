// Calendário, cálculo de uma partida da liga e classificação.
// Não depende do navegador nem do banco: recebe os dados e devolve o que deve ser gravado.
import { criarRng } from "./rng.js";
import { notaNaPosicao, LISTA_POSICOES } from "./modelo.js";
import { prepararTime, simularPartida, CONFIG } from "./motor.js";
import { taticaBot } from "./bot.js";
import { montarRelatorio } from "./relatorio.js";

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
    if (dados.jog.some(id => !porId[id]) || new Set(dados.jog).size !== 11) return null;
    const emCampo = new Set(dados.jog);
    const banco = [...new Set((dados.banco || []).filter(id => porId[id] && !emCampo.has(id)))].slice(0, 7);
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
    return { escalacao: dados.vagas.map((pos, i) => ({ j: porId[dados.jog[i]], pos })), banco: banco.map(id => porId[id]), instrucoes };
  } catch (e) { return null; }
}

const forcaDoOnze = escalacao => escalacao.reduce((s, x) => s + notaNaPosicao(x.j, x.pos), 0) / escalacao.length;

// Instante em que um minuto de jogo passa a ser visível, com 15 minutos de intervalo, na escala da transmissão.
export function horaDoMinuto(inicio, min, minutosTransmissao) {
  const reais = (min <= 45 ? min : min + 15) * minutosTransmissao / 105;
  return new Date(new Date(inicio).getTime() + reais * 60000);
}

// lado: { clube: { id, nome, dono, ultimo_acesso }, elenco, tatica: dados salvos ou null }
// Devolve as linhas de lances e o resultado a gravar.
export function calcularPartida({ partida, casa, fora, minutosTransmissao = 105, semente }) {
  const agora = new Date(partida.inicio).getTime();
  const lados = [casa, fora].map(l => {
    const inativo = !l.clube.dono || !l.clube.ultimo_acesso || agora - new Date(l.clube.ultimo_acesso).getTime() > DIAS_PARA_BOT * 86400000;
    const humana = inativo ? null : taticaDoDirigente(l.tatica, l.elenco);
    return { ...l, humana, previa: humana ? forcaDoOnze(humana.escalacao) : taticaBot(l.elenco).forca };
  });
  const times = lados.map((l, i) => {
    const t = l.humana || taticaBot(l.elenco, { mandante: i === 0, forcaAdversario: lados[1 - i].previa });
    return prepararTime({ nome: l.clube.nome, escalacao: t.escalacao, banco: t.banco, instrucoes: t.instrucoes, mandante: i === 0 });
  });
  const p = simularPartida(criarRng(semente), times[0], times[1]);
  const r = montarRelatorio(p, [3, 3]);
  const lances = p.narracao.map((l, ordem) => ({ partida_id: partida.id, ordem, min: l.min, libera_em: horaDoMinuto(partida.inicio, l.min, minutosTransmissao).toISOString(), dados: l }));
  const { narracao, ...semNarracao } = r; // a narração já está nos lances
  return {
    lances,
    resultado: {
      partida_id: partida.id, libera_em: partida.fim, gols_casa: p.placar[0], gols_fora: p.placar[1], xg_casa: p.xg[0], xg_fora: p.xg[1],
      pts_esp_casa: r.esperado.pontos[0], pts_esp_fora: r.esperado.pontos[1],
      relatorio: { ...semNarracao, comandados: lados.map(l => l.humana ? "dirigente" : "bot") },
    },
  };
}

// Tabela de um grupo a partir das partidas com resultado visível. Desempate: pontos, saldo, gols pró, gols contra.
export function classificacao(clubes, partidas, resultados) {
  const t = Object.fromEntries(clubes.map(c => [c.id, { clube: c, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, esp: 0 }]));
  const res = Object.fromEntries(resultados.map(r => [r.partida_id, r]));
  for (const p of partidas) {
    const r = res[p.id], a = t[p.casa], b = t[p.fora];
    if (!r || !a || !b) continue;
    a.j++; b.j++; a.gp += r.gols_casa; a.gc += r.gols_fora; b.gp += r.gols_fora; b.gc += r.gols_casa; a.esp += r.pts_esp_casa; b.esp += r.pts_esp_fora;
    if (r.gols_casa > r.gols_fora) { a.v++; b.d++; a.pts += 3; } else if (r.gols_casa < r.gols_fora) { b.v++; a.d++; b.pts += 3; } else { a.e++; b.e++; a.pts++; b.pts++; }
  }
  return Object.values(t).sort((x, y) => y.pts - x.pts || (y.gp - y.gc) - (x.gp - x.gc) || y.gp - x.gp || x.gc - y.gc || x.clube.nome.localeCompare(y.clube.nome));
}
