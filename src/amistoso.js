// Amistoso: a tática de cada lado (amistoso → campeonato → bot), o bot de estilo e o jogo, sempre com as regras e os papéis da T1.
// Nada aqui sorteia sozinho: a semente vem de fora (do banco, contra dirigente; da tela, contra bot).
import { criarRng } from "./rng.js";
import { prepararTime, simularPartida } from "./motor.js";
import { taticaDoDirigente } from "./rodada.js";
import { taticaBot, ESTILO_DO_PERFIL } from "./bot.js";
import { gerarElenco } from "./gerador.js";
import { montarRelatorio } from "./relatorio.js";

export const ESTILOS_DE_BOT = Object.keys(ESTILO_DO_PERFIL);

export function taticaParaAmistoso(dadosAmistoso, dadosLiga, elenco, opcoesBot = {}) {
  const amistoso = taticaDoDirigente(dadosAmistoso, elenco);
  if (amistoso) return { ...amistoso, origem: "tática de amistoso" };
  const liga = taticaDoDirigente(dadosLiga, elenco);
  if (liga) return { ...liga, origem: "tática do campeonato" };
  return { ...taticaBot(elenco, opcoesBot), origem: "tática de bot" };
}

// sempre o mesmo elenco para o mesmo estilo e nível (nomes: dados/nomes.json)
export const elencoDoBot = (estilo, nivel, nomes) =>
  gerarElenco(criarRng(ESTILOS_DE_BOT.indexOf(estilo) + 1000), { nivel: Math.round(nivel), perfil: estilo, nomes, prefixoId: "bot-" + estilo + "-" });

export function jogarAmistoso({ casa, fora, semente }) {
  const time = (t, mandante) => prepararTime({ nome: t.nome, escalacao: t.tatica.escalacao, banco: t.tatica.banco, instrucoes: t.tatica.instrucoes, mandante });
  const partida = simularPartida(criarRng(semente), time(casa, true), time(fora, false), { regrasT1: true });
  const e = partida.estat;
  return {
    partida, relatorio: montarRelatorio(partida, [3, 3]), placar: partida.placar,
    resumo: { xg: partida.xg, posse: [e[0].posse, e[1].posse], chutes: [e[0].finalizacoes, e[1].finalizacoes] },
  };
}

// só o que o replay e o relatório usam
export function partidaParaGravar(p) {
  const { placar, xg, estat, lances, eventos, narracao, jogadores, ordens, acrescimos, duracao, penaltis } = p;
  return { placar, xg, estat, lances, eventos, narracao, jogadores, ordens, acrescimos, duracao, penaltis };
}
