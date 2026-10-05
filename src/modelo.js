// Modelo de jogador: 22 atributos (os 21 do Dugout + Resistência), 18 posições e nota por posição.
// Os pesos e os fatores de familiaridade são ponto de partida; a calibragem do motor pode mexer neles.

// uma constante exportada por linha: o empacotador das funções do servidor só enxerga o primeiro nome de cada "export const"
export const ATR_MIN = 1;
export const ATR_MAX = 50;

// grupo: gol (só goleiro), def, tec (técnicos de linha), fis, men
export const ATRIBUTOS = [
  { k: "ref", nome: "Reflexos", grupo: "gol" },
  { k: "um", nome: "Um contra um", grupo: "gol" },
  { k: "enc", nome: "Encaixe", grupo: "gol" },
  { k: "com", nome: "Comunicação", grupo: "men" },
  { k: "pos", nome: "Posicionamento", grupo: "men" },
  { k: "des", nome: "Desarme", grupo: "def" },
  { k: "mar", nome: "Marcação", grupo: "def" },
  { k: "cab", nome: "Cabeceio", grupo: "tec" },
  { k: "cru", nome: "Cruzamento", grupo: "tec" },
  { k: "cri", nome: "Criatividade", grupo: "tec" },
  { k: "pas", nome: "Passe", grupo: "tec" },
  { k: "dom", nome: "Domínio", grupo: "tec" },
  { k: "lon", nome: "Chute de longe", grupo: "tec" },
  { k: "fin", nome: "Finalização", grupo: "tec" },
  { k: "dri", nome: "Drible", grupo: "tec" },
  { k: "vel", nome: "Velocidade", grupo: "fis" },
  { k: "for", nome: "Força", grupo: "fis" },
  { k: "res", nome: "Resistência", grupo: "fis" },
  { k: "equ", nome: "Trabalho em equipe", grupo: "men" },
  { k: "agr", nome: "Agressividade", grupo: "men" },
  { k: "inf", nome: "Influência", grupo: "men" },
  { k: "exc", nome: "Excentricidade", grupo: "men" },
];
export const IDX = Object.fromEntries(ATRIBUTOS.map((a, i) => [a.k, i]));

// linha: gol, defesa, ala, volante, meio, meia, ataque · lado: E, C, D
export const POSICOES = {
  GK: { nome: "Goleiro", linha: "gol", lado: "C", papel: "GK" },
  DC: { nome: "Zagueiro", linha: "defesa", lado: "C", papel: "DC" },
  SW: { nome: "Líbero", linha: "defesa", lado: "C", papel: "SW" },
  DR: { nome: "Lateral direito", linha: "defesa", lado: "D", papel: "LAT" },
  DL: { nome: "Lateral esquerdo", linha: "defesa", lado: "E", papel: "LAT" },
  WBR: { nome: "Ala direito", linha: "ala", lado: "D", papel: "ALA" },
  WBL: { nome: "Ala esquerdo", linha: "ala", lado: "E", papel: "ALA" },
  DMC: { nome: "Volante", linha: "volante", lado: "C", papel: "DMC" },
  MC: { nome: "Meio-campista", linha: "meio", lado: "C", papel: "MC" },
  AMC: { nome: "Meia-atacante", linha: "meia", lado: "C", papel: "AMC" },
  MR: { nome: "Meia direita", linha: "meio", lado: "D", papel: "MLAT" },
  ML: { nome: "Meia esquerda", linha: "meio", lado: "E", papel: "MLAT" },
  AMR: { nome: "Meia-atacante direito", linha: "meia", lado: "D", papel: "AMLAT" },
  AML: { nome: "Meia-atacante esquerdo", linha: "meia", lado: "E", papel: "AMLAT" },
  RW: { nome: "Ponta direita", linha: "ataque", lado: "D", papel: "PONTA" },
  LW: { nome: "Ponta esquerda", linha: "ataque", lado: "E", papel: "PONTA" },
  FC: { nome: "Atacante móvel", linha: "ataque", lado: "C", papel: "FC" },
  SC: { nome: "Centroavante", linha: "ataque", lado: "C", papel: "SC" },
};
export const LISTA_POSICOES = Object.keys(POSICOES);

// Peso de cada atributo na nota da posição (cada linha soma 100).
export const PESOS = {
  GK: { ref: 22, enc: 18, um: 16, pos: 16, com: 12, vel: 4, for: 4, inf: 4, equ: 4 },
  DC: { mar: 20, des: 20, pos: 16, cab: 14, for: 10, vel: 8, com: 6, equ: 3, pas: 3 },
  SW: { pos: 22, des: 14, vel: 14, mar: 10, com: 10, pas: 10, cab: 6, equ: 6, cri: 4, dom: 4 },
  LAT: { des: 18, mar: 16, vel: 16, pos: 12, cru: 10, res: 8, pas: 6, com: 4, equ: 4, for: 3, dri: 3 },
  ALA: { vel: 16, cru: 16, res: 12, des: 12, dri: 10, mar: 8, pos: 8, pas: 8, equ: 6, dom: 4 },
  DMC: { des: 20, pos: 20, mar: 12, pas: 12, for: 8, res: 8, equ: 8, cab: 4, dom: 4, agr: 4 },
  MC: { pas: 20, cri: 16, dom: 12, pos: 10, equ: 10, res: 8, des: 8, lon: 8, vel: 4, dri: 4 },
  AMC: { cri: 20, pas: 16, dom: 14, lon: 12, dri: 12, fin: 8, pos: 6, vel: 6, equ: 6 },
  MLAT: { cru: 18, pas: 14, vel: 12, dom: 10, cri: 10, dri: 10, res: 8, pos: 6, des: 6, equ: 6 },
  AMLAT: { dri: 18, cri: 14, cru: 12, vel: 12, pas: 10, dom: 10, lon: 8, fin: 8, pos: 4, equ: 4 },
  PONTA: { dri: 20, vel: 20, cru: 14, fin: 12, dom: 10, cri: 6, pos: 6, pas: 4, res: 4, lon: 4 },
  FC: { fin: 22, dom: 16, vel: 14, dri: 12, pos: 12, cri: 6, pas: 6, lon: 4, cab: 4, equ: 4 },
  SC: { fin: 22, cab: 20, for: 18, pos: 12, dom: 10, equ: 4, vel: 4, lon: 4, agr: 3, pas: 3 },
};

// Familiaridade com a posição, como no Dugout: Natural, Competente, Improvisado.
export const FAMILIARIDADE = { N: 1, C: 0.93, I: 0.8 };
export const NOME_FAMILIARIDADE = { N: "Natural", C: "Competente", I: "Improvisado" };

// Posições parecidas, em que o jogador pode ser natural ou competente além da principal.
export const VIZINHAS = {
  GK: [],
  DC: ["SW", "DMC", "DR", "DL"],
  SW: ["DC", "DMC"],
  DR: ["WBR", "DL", "DC", "MR"],
  DL: ["WBL", "DR", "DC", "ML"],
  WBR: ["DR", "MR", "WBL"],
  WBL: ["DL", "ML", "WBR"],
  DMC: ["MC", "DC", "SW"],
  MC: ["DMC", "AMC", "MR", "ML"],
  AMC: ["MC", "AMR", "AML", "FC"],
  MR: ["AMR", "WBR", "ML", "MC"],
  ML: ["AML", "WBL", "MR", "MC"],
  AMR: ["MR", "RW", "AML", "AMC"],
  AML: ["ML", "LW", "AMR", "AMC"],
  RW: ["AMR", "LW", "FC"],
  LW: ["AML", "RW", "FC"],
  FC: ["SC", "AMC", "RW", "LW"],
  SC: ["FC"],
};

export const familiaridade = (jogador, pos) => jogador.fam[pos] || "I";

// Nota do jogador numa posição, na escala dos atributos (1 a 50), sem a familiaridade.
export function notaBruta(atributos, pos) {
  const pesos = PESOS[POSICOES[pos].papel];
  let soma = 0;
  for (const k in pesos) soma += pesos[k] * atributos[IDX[k]];
  return soma / 100;
}

// Pé dominante: "D" (direito), "E" (esquerdo) ou "A" (ambidestro). Só pesa em quem joga pelos lados, como no futebol de verdade:
//   no lado do pé bom, o cruzamento sai melhor;
//   no lado trocado, lateral, ala e meia aberto cruzam e passam pior;
//   ponta e meia-atacante de pé trocado cruzam pior, mas cortam para dentro e finalizam melhor.
// Ambidestro e quem joga pelo centro não mudam. Devolve { índice do atributo: multiplicador } ou null.
export const NOME_DO_PE = { D: "direito", E: "esquerdo", A: "ambidestro" };
export const CONFIG_PE = { cruzaBem: 1.04, cruzaMal: 0.90, passaMal: 0.97, finalizaBem: 1.05 };
export function ajusteDoPe(pe, pos) {
  const p = POSICOES[pos];
  if (!p || p.lado === "C" || !pe || pe === "A") return null;
  if (pe === p.lado) return { [IDX.cru]: CONFIG_PE.cruzaBem };
  return p.linha === "ataque" || p.linha === "meia"
    ? { [IDX.cru]: CONFIG_PE.cruzaMal, [IDX.fin]: CONFIG_PE.finalizaBem, [IDX.lon]: CONFIG_PE.finalizaBem }
    : { [IDX.cru]: CONFIG_PE.cruzaMal, [IDX.pas]: CONFIG_PE.passaMal };
}
// como o pé cai numa posição de lado: "natural", "trocado" ou "" (centro, ambidestro ou sem pé definido)
export const peNaPosicao = (pe, pos) => { const p = POSICOES[pos]; return !p || p.lado === "C" || !pe || pe === "A" ? "" : pe === p.lado ? "natural" : "trocado"; };

export const notaNaPosicao = (jogador, pos) => notaBruta(jogador.at, pos) * FAMILIARIDADE[familiaridade(jogador, pos)];

export function melhorPosicao(jogador) {
  let melhor = null;
  for (const pos of LISTA_POSICOES) {
    const nota = notaNaPosicao(jogador, pos);
    if (!melhor || nota > melhor.nota) melhor = { pos, nota };
  }
  return melhor;
}
