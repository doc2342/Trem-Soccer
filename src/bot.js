// Tática de bot: vale para clubes sem dono e para dirigentes há 21 dias sem acessar.
// O bot joga certo, mas sem ler o adversário: escolhe a formação que melhor aproveita o elenco e instruções neutras.
import { IDX, notaNaPosicao, notaComPe } from "./modelo.js";
import { fatorDeMomento } from "./saude.js";
// nota na posição já com o pé, a forma, a moral e a experiência do jogador: é com ela que o bot (e o botão de escalar os melhores) escolhe
const notaDoMomento = (j, pos) => notaComPe(j, pos) * fatorDeMomento(j);
import { FORMACOES, escalar } from "./escalacao.js";
import { avaliarZonas } from "./motor.js";

export const FORMACOES_BOT = ["4-4-2", "4-3-3 com pontas", "4-2-3-1", "3-5-2 com alas", "4-5-1"];
// Jeito de jogar do bot conforme o perfil do clube. É o que o dirigente pode ler no adversário para escolher a resposta.
export const ESTILO_DO_PERFIL = {
  equilibrado: { nome: "sem estilo marcado", instrucoes: {} },
  tecnico: { nome: "passe curto e posse de bola", instrucoes: { passe: "curto" } },
  fisico: { nome: "pressão alta", instrucoes: { pressao: 2 } },
  veloz: { nome: "contra-ataque", instrucoes: { contraAtaque: true } },
  tatico: { nome: "linha de impedimento", instrucoes: { impedimento: true } },
};
const FAVORITO = 2; // diferença de nota média a partir da qual o bot se considera favorito ou azarão
const A = IDX;

const mediaNotas = escalacao => escalacao.reduce((s, x) => s + notaDoMomento(x.j, x.pos), 0) / escalacao.length;
const melhores = (lista, nota, n) => lista.slice().sort((a, b) => nota(b) - nota(a)).slice(0, n).map(x => x.j.id);

// elenco: jogadores disponíveis (sem lesionados e suspensos). forcaAdversario: nota média do onze do adversário, se conhecida.
export function taticaBot(elenco, { mandante = false, forcaAdversario = null, perfil = null } = {}) {
  const estilo = (ESTILO_DO_PERFIL[perfil] || ESTILO_DO_PERFIL.equilibrado).instrucoes;
  // formação: a que dá a maior nota somada ao melhor onze disponível
  let melhor = null;
  for (const nome of FORMACOES_BOT) {
    const escalacao = escalar(elenco, FORMACOES[nome]);
    if (escalacao.length < 11) continue;
    const forca = mediaNotas(escalacao);
    if (!melhor || forca > melhor.forca) melhor = { formacao: nome, escalacao, forca };
  }
  if (!melhor) { const escalacao = escalar(elenco, FORMACOES["4-4-2"]); melhor = { formacao: "4-4-2", escalacao, forca: escalacao.length ? mediaNotas(escalacao) : 0 }; }
  const { formacao, escalacao, forca } = melhor;

  // banco: um goleiro e os seis melhores que sobraram
  const fora = elenco.filter(j => !escalacao.some(x => x.j === j)).sort((a, b) => notaDoMomento(b, b.pos) - notaDoMomento(a, a.pos));
  const banco = [...fora.filter(j => j.pos === "GK").slice(0, 1), ...fora.filter(j => j.pos !== "GK").slice(0, 6)];

  // mentalidade: normal; um nível acima se é favorito, um abaixo se é azarão (o mando já pesa no motor)
  const dif = forcaAdversario == null ? 0 : forca - forcaAdversario;
  const mentalidade = dif <= -FAVORITO ? -1 : dif >= FAVORITO ? 1 : 0;

  // lado: o próprio corredor mais forte, se houver um claramente melhor
  const { atk } = avaliarZonas(escalacao);
  const lado = atk.AE > atk.AD * 1.25 ? "E" : atk.AD > atk.AE * 1.25 ? "D" : "misto";

  const linha = escalacao.filter(x => x.pos !== "GK");
  // até três trocas, aos 60, 70 e 80: saem os de menor Resistência que tenham reserva à altura para a posição
  const livres = banco.filter(j => j.pos !== "GK"), substituicoes = [];
  for (const x of linha.slice().sort((a, b) => a.j.at[A.res] - b.j.at[A.res])) {
    if (substituicoes.length === 3 || !livres.length) break;
    livres.sort((a, b) => notaDoMomento(b, x.pos) - notaDoMomento(a, x.pos));
    if (notaDoMomento(livres[0], x.pos) < 0.85 * notaDoMomento(x.j, x.pos)) continue; // sem reserva à altura para a posição
    substituicoes.push({ min: 60 + 10 * substituicoes.length, sai: x.j.id, entra: livres.shift().id, cond: "sempre" });
  }

  const porInfluencia = melhores(escalacao, x => x.j.at[A.inf], 2);
  const meias = linha.filter(x => ["MC", "AMC", "DMC", "AMR", "AML", "MR", "ML"].includes(x.pos));
  const atacantes = linha.filter(x => ["SC", "FC"].includes(x.pos));
  const instrucoes = {
    mentalidade, agressividade: 0, pressao: 0, passe: "misto", lado, contraAtaque: false, impedimento: false, ...estilo,
    capitao: porInfluencia[0], vice: porInfluencia[1],
    armador: melhores(meias.length ? meias : linha, x => x.j.at[A.cri], 1)[0],
    alvo: melhores(atacantes.length ? atacantes : linha, x => x.j.at[A.cab] + x.j.at[A.for], 1)[0],
    cobradores: {
      escanteio: melhores(linha, x => x.j.at[A.cru], 3),
      falta: melhores(linha, x => x.j.at[A.lon] * 0.6 + x.j.at[A.cri] * 0.4, 3),
      penalti: melhores(linha, x => x.j.at[A.fin], 5),
    },
    substituicoes,
    ordens: [
      { min: 70, cond: "perdendo", muda: { mentalidade: Math.min(2, mentalidade + 1) } },
      { min: 80, cond: "ganhando", muda: { mentalidade: Math.max(-2, mentalidade - 1) } },
    ],
  };
  return { formacao, escalacao, banco, instrucoes, forca };
}
