// Liga de base: os juvenis de cada grupo jogam um turno único (9 rodadas), espelhando o primeiro turno da liga principal.
// O time é montado sozinho: entram os juvenis de verdade e, só nas vagas que faltarem para completar onze (goleiro incluso), garotos da escolinha,
// que não existem fora da partida. Não há lesão, cartão, experiência, forma, moral nem bilheteria: ficam o placar, os gols e as notas,
// e quem jogou 45 minutos ganha um bônus de treino. Módulo puro: usado pela função do servidor.
import { ATRIBUTOS, notaBruta } from "./modelo.js";
import { limitar } from "./rng.js";

export const CONFIG_LIGA_DE_BASE = {
  escolinha: [13, 1.2], // nota do garoto da escolinha: 13 + 1,2 por nível da base (o juvenil de verdade chega com 15 + 1,5 por nível e treina)
  nivelDoBot: 3,        // clube sem dirigente não tem juvenis: os garotos dele valem os de uma base de nível 3, para a liga não ser um passeio
  bonusDeTreino: 0.2,   // fração de uma sessão de treino para quem jogou: equivale ao bônus de 10% por jogar em duas rodadas da liga
  minutos: 45,
  premio: 200,          // mil, ao campeão de cada grupo, pagos pelo fundo da liga
};
const VAGAS = ["GK", "DC", "DC", "DR", "DL", "MC", "MC", "MR", "ML", "FC", "SC"];

export function garotoDaEscolinha(rng, pos, nivel, id) {
  const at = ATRIBUTOS.map(a => limitar(Math.round((a.grupo === "gol" && pos !== "GK" ? 3 : nivel) + rng.normal(0, 2)), 1, 50));
  return { id, nome: "Garoto da escolinha", pais: "Brasil", idade: 16, pos, fam: { [pos]: "N" }, at, pe: "D", escolinha: true };
}

// juvenis: os de verdade, no formato do motor. Devolve o elenco da partida: todos eles mais os garotos necessários para haver onze e um goleiro.
export function timeDaBase(rng, juvenis, nivelDaBase = 0, prefixo = "") {
  const nivel = CONFIG_LIGA_DE_BASE.escolinha[0] + CONFIG_LIGA_DE_BASE.escolinha[1] * (nivelDaBase || 0), livres = VAGAS.slice(), garotos = [];
  for (const j of juvenis.slice().sort((a, b) => notaBruta(b.at, b.pos) - notaBruta(a.at, a.pos))) {
    let i = livres.indexOf(j.pos);
    if (i < 0 && j.pos !== "GK") i = livres.findIndex(p => p !== "GK");
    if (i >= 0) livres.splice(i, 1);
  }
  const novo = pos => garotos.push(garotoDaEscolinha(rng, pos, nivel, "e" + prefixo + "_" + garotos.length));
  if (!juvenis.some(j => j.pos === "GK")) novo("GK");
  const deLinha = livres.filter(p => p !== "GK");
  while (juvenis.length + garotos.length < 11) novo(deLinha.shift() || "MC");
  return [...juvenis, ...garotos];
}
