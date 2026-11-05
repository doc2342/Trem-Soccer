// Evolução da temporada (aba Treino): quanto cada jogador ganhou desde a foto do início (jogadores.inicio_temporada, SQL 40 e 175:
// { t, nota, soma, exp, idade }). Só o site usa: fora das funções do servidor.
import { notaBruta } from "./modelo.js";
import { experienciaDe } from "./saude.js";

// jogadores: o elenco (com j.inicio, como banco.js lê); temporada: a atual. Quem não tem foto desta temporada (revelado ou criado
// depois dela) fica de fora: comparar com zero daria centenas de pontos. Foto sem exp (antes do 175): a XP do início é o piso pela idade.
export const evolucaoDaTemporada = (jogadores, temporada) => jogadores.filter(j => j.inicio && j.inicio.t === temporada).map(j => {
  const ini = j.inicio, soma = j.at.reduce((s, v) => s + (v || 0), 0);
  return { j, atributos: soma - ini.soma,
    xp: Math.round((experienciaDe(j) - experienciaDe({ exp: ini.exp ?? null, idade: ini.idade ?? j.idade })) * 10) / 10,
    nota: Math.round((notaBruta(j.at, j.pos) - ini.nota) * 10) / 10 };
});
