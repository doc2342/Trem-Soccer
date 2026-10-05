// Formações de referência e escalação automática simples (o melhor disponível para cada vaga).
import { notaNaPosicao, notaComPe } from "./modelo.js";
import { fatorDeMomento } from "./saude.js";
// nota na posição já com o pé, a forma, a moral e a experiência do jogador: é com ela que o bot (e o botão de escalar os melhores) escolhe
export const notaDoMomento = (j, pos) => notaComPe(j, pos) * fatorDeMomento(j);

export const FORMACOES = {
  "4-4-2": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "MC", "ML", "FC", "SC"],
  "4-3-3 com pontas": ["GK", "DR", "DC", "DC", "DL", "DMC", "MC", "MC", "RW", "LW", "SC"],
  "4-2-3-1": ["GK", "DR", "DC", "DC", "DL", "DMC", "DMC", "AMR", "AMC", "AML", "SC"],
  "3-5-2 com alas": ["GK", "DC", "DC", "DC", "WBR", "WBL", "DMC", "MC", "MC", "FC", "SC"],
  "4-5-1": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "DMC", "MC", "ML", "SC"],
  "4-3-3 do Dugout (1 MC, 3 FC)": ["GK", "DR", "DC", "DC", "DL", "MR", "MC", "ML", "FC", "FC", "FC"],
};

// Preenche as vagas pegando sempre o par (vaga, jogador) de maior nota entre os que sobraram.
export function escalar(elenco, vagas) {
  const livres = new Set(elenco), escalacao = new Array(vagas.length).fill(null);
  for (let n = 0; n < vagas.length; n++) {
    let melhor = null;
    vagas.forEach((pos, i) => {
      if (escalacao[i]) return;
      for (const j of livres) {
        const nota = notaDoMomento(j, pos);
        if (!melhor || nota > melhor.nota) melhor = { i, j, pos, nota };
      }
    });
    if (!melhor) break;
    escalacao[melhor.i] = { j: melhor.j, pos: melhor.pos };
    livres.delete(melhor.j);
  }
  return escalacao.filter(Boolean);
}
